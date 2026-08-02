import Foundation
import IOBluetooth

final class SDPQueryDelegate: NSObject, IOBluetoothDeviceAsyncCallbacks {
    var completed = false
    var status: IOReturn = kIOReturnError

    func remoteNameRequestComplete(_ device: IOBluetoothDevice, status: IOReturn) {}
    func connectionComplete(_ device: IOBluetoothDevice, status: IOReturn) {}

    func sdpQueryComplete(_ device: IOBluetoothDevice, status: IOReturn) {
        self.status = status
        completed = true
    }
}

final class ChannelDelegate: NSObject, IOBluetoothRFCOMMChannelDelegate {
    var received = Data()

    func rfcommChannelData(
        _ rfcommChannel: IOBluetoothRFCOMMChannel,
        data dataPointer: UnsafeMutableRawPointer,
        length dataLength: Int,
    ) {
        received.append(Data(bytes: dataPointer, count: dataLength))
    }

    func rfcommChannelClosed(_ rfcommChannel: IOBluetoothRFCOMMChannel) {
        output(["ok": false, "error": "RFCOMM channel closed"])
        exit(2)
    }
}

struct ServiceCandidate {
    let name: String
    let channel: BluetoothRFCOMMChannelID
}

func normalized(_ value: String) -> String {
    value
        .replacingOccurrences(of: "/dev/tty.", with: "")
        .replacingOccurrences(of: "/dev/cu.", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
}

func output(_ value: [String: Any]) {
    guard
        let data = try? JSONSerialization.data(withJSONObject: value),
        let line = String(data: data, encoding: .utf8)
    else { return }
    print(line)
    fflush(stdout)
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    output(["ok": false, "error": message])
    exit(code)
}

func waitForSDP(_ device: IOBluetoothDevice) {
    let delegate = SDPQueryDelegate()
    let status = device.performSDPQuery(delegate)
    guard status == kIOReturnSuccess else { return }

    let deadline = Date().addingTimeInterval(5)
    while !delegate.completed && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
}

func pairedDevice(matching needle: String) -> IOBluetoothDevice? {
    let target = normalized(needle)
    let devices = (IOBluetoothDevice.pairedDevices() as? [IOBluetoothDevice]) ?? []
    return devices.first { device in
        [device.name ?? "", device.nameOrAddress ?? "", device.addressString ?? ""]
            .map(normalized)
            .contains(target)
    }
}

func servicesFor(_ device: IOBluetoothDevice) -> [ServiceCandidate] {
    waitForSDP(device)
    let services = (device.services as? [IOBluetoothSDPServiceRecord]) ?? []
    return services.compactMap { service in
        var channel: BluetoothRFCOMMChannelID = 0
        guard service.getRFCOMMChannelID(&channel) == kIOReturnSuccess else {
            return nil
        }
        return ServiceCandidate(name: service.getServiceName() ?? "", channel: channel)
    }
}

func selectedChannel(for device: IOBluetoothDevice, configured: String?) -> BluetoothRFCOMMChannelID {
    if let configured, let value = UInt8(configured), value > 0, value <= 30 {
        return value
    }

    let services = servicesFor(device)
    let preferred = services.first {
        let name = $0.name.lowercased()
        return name.contains("serial") || name.contains("spp") || name.contains("printer")
    }
    guard let candidate = preferred ?? services.first else {
        fail("No RFCOMM service found")
    }
    return candidate.channel
}

func write(_ data: Data, to channel: IOBluetoothRFCOMMChannel) {
    if data.isEmpty { return }
    var mutableData = data
    let channelMTU = Int(channel.getMTU())
    let chunkSize = channelMTU > 0 ? channelMTU : 127
    mutableData.withUnsafeMutableBytes { rawBuffer in
        guard let pointer = rawBuffer.baseAddress else { return }
        var offset = 0
        while offset < data.count {
            let length = min(chunkSize, data.count - offset)
            let result = channel.writeSync(
                pointer.advanced(by: offset),
                length: UInt16(length),
            )
            guard result == kIOReturnSuccess else {
                fail(
                    "RFCOMM write failed: \(result) at offset \(offset) of \(data.count) bytes (MTU \(chunkSize))",
                )
            }
            offset += length
        }
    }
}

func readExact(_ length: Int) -> Data? {
    var result = Data()
    while result.count < length {
        do {
            guard
                let chunk = try FileHandle.standardInput.read(
                    upToCount: length - result.count,
                ),
                !chunk.isEmpty
            else {
                return nil
            }
            result.append(chunk)
        } catch {
            return nil
        }
    }
    return result
}

func uint32(_ data: Data) -> UInt32 {
    data.reduce(UInt32(0)) { value, byte in
        (value << 8) | UInt32(byte)
    }
}

func probe(
    _ delegate: ChannelDelegate,
    channel: IOBluetoothRFCOMMChannel,
) -> Bool {
    delegate.received.removeAll(keepingCapacity: true)
    write(Data([0x10, 0x04, 0x01]), to: channel)
    // Give a waking/reconnecting SPP bridge enough time to answer, but stop
    // as soon as the printer sends anything. The Node side waits a little
    // longer than this window so the JSON result cannot race its timeout.
    let deadline = Date().addingTimeInterval(1.5)
    while delegate.received.isEmpty && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
    let responded = !delegate.received.isEmpty
    output([
        "probe": responded,
        "bytes": delegate.received.count,
        "hex": delegate.received.map { String(format: "%02x", $0) }.joined(),
    ])
    return responded
}

let arguments = CommandLine.arguments
guard let pathIndex = arguments.firstIndex(of: "--path"), pathIndex + 1 < arguments.count else {
    fail("Missing --path")
}
let path = arguments[pathIndex + 1]
let configuredChannel: String? = {
    guard let index = arguments.firstIndex(of: "--channel"), index + 1 < arguments.count else {
        return nil
    }
    let value = arguments[index + 1]
    return value.isEmpty ? nil : value
}()
let shouldProbe = arguments.contains("--probe")

guard let device = pairedDevice(matching: path) else {
    fail("Paired Bluetooth device not found for \(path)")
}

let channelID = selectedChannel(for: device, configured: configuredChannel)
let delegate = ChannelDelegate()
var channel: IOBluetoothRFCOMMChannel?
let openStatus = device.openRFCOMMChannelSync(&channel, withChannelID: channelID, delegate: delegate)
guard openStatus == kIOReturnSuccess, let channel else {
    fail("RFCOMM channel open failed: \(openStatus)")
}

RunLoop.current.run(until: Date().addingTimeInterval(0.4))

if shouldProbe {
    _ = probe(delegate, channel: channel)
}

output([
    "ok": true,
    "ready": true,
    "device": device.nameOrAddress ?? "",
    "address": device.addressString ?? "",
    "channel": channelID,
])

// Keep the RFCOMM channel alive between print jobs. Each frame is a
// big-endian payload length followed by the ESC/POS bytes. 0xffffffff asks
// for a status probe without closing the channel.
while let header = readExact(4) {
    let length = uint32(header)
    if length == UInt32.max {
        _ = probe(delegate, channel: channel)
        continue
    }
    guard length <= 128 * 1024 * 1024 else {
        fail("Payload too large")
    }
    guard let payload = readExact(Int(length)) else {
        break
    }
    write(payload, to: channel)
    output(["sent": payload.count])
}

_ = channel.close()
