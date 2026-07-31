export type LanguageSetting = "system" | "es" | "en";
export type SupportedLanguage = Exclude<LanguageSetting, "system">;
export type MessageParams = Record<string, string | number>;

export type BridgeMessage = {
  code: string;
  params?: MessageParams;
};

export class BridgeError extends Error {
  constructor(
    public readonly code: string,
    public readonly params?: MessageParams,
  ) {
    super(code);
    this.name = "BridgeError";
  }
}

export const message = (code: string, params?: MessageParams): BridgeMessage =>
  params ? { code, params } : { code };

export const errorPayload = (error: unknown): BridgeMessage => {
  if (error instanceof BridgeError) return message(error.code, error.params);
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as BridgeMessage).code === "string"
  )
    return error as BridgeMessage;
  return message("operation_failed");
};

export const resolveLanguage = (
  setting: LanguageSetting,
  systemLocale?: string,
): SupportedLanguage => {
  if (setting !== "system") return setting;
  return /^en(?:[-_]|$)/i.test(systemLocale || "") ? "en" : "es";
};

export type TranslationKey =
  | "active"
  | "app_description"
  | "refresh"
  | "advanced_settings"
  | "bridge_host"
  | "bridge_host_description"
  | "access_token"
  | "access_token_description"
  | "copy"
  | "printers"
  | "printers_description"
  | "add"
  | "no_printers"
  | "enabled"
  | "disabled"
  | "no_recent_check"
  | "print_test"
  | "open_drawer"
  | "edit"
  | "delete"
  | "delete_printer_confirm"
  | "printer_detection"
  | "printer_detection_description"
  | "find_network"
  | "detect_usb"
  | "bluetooth_serial"
  | "searching_network"
  | "detecting_usb"
  | "searching_devices"
  | "wait_for_scan"
  | "latest_scan"
  | "devices_found"
  | "use_result"
  | "no_devices"
  | "edit_printer"
  | "add_printer"
  | "detected_connection_notice"
  | "discard_printer_changes_title"
  | "discard_printer_changes_description"
  | "discard_changes"
  | "continue_editing"
  | "check_connection_before_saving"
  | "connection_section"
  | "print_profile_section"
  | "operation_section"
  | "advanced_printing"
  | "name"
  | "type"
  | "width"
  | "network"
  | "usb"
  | "bluetooth"
  | "host"
  | "port"
  | "installed_windows_printer"
  | "windows_printer_placeholder"
  | "path"
  | "open_drawer_setting"
  | "printer_enabled"
  | "cancel"
  | "close"
  | "test_without_saving"
  | "save_printer"
  | "validation_required"
  | "validation_port"
  | "validation_baud_rate"
  | "validation_vendor_id"
  | "validation_product_id"
  | "validation_windows_printer"
  | "validation_model_length"
  | "validation_encoding"
  | "validation_character_table"
  | "validation_origin"
  | "settings_description"
  | "allowed_origins"
  | "save_settings"
  | "language"
  | "language_system"
  | "language_spanish"
  | "language_english"
  | "printing_language"
  | "profile_label"
  | "profile_automatic"
  | "profile_custom"
  | "profile_auto_description"
  | "profile_custom_description"
  | "encoding"
  | "character_table"
  | "custom_character_table"
  | "custom_character_table_number"
  | "unicode_strategy"
  | "unicode_auto"
  | "unicode_raster"
  | "unicode_native"
  | "profile_custom_notice"
  | "profile_bitmap_fallback"
  | "profile_native_coverage"
  | "profile_reset_for_language"
  | "advanced_profile_notice"
  | "printer_model"
  | "search_profiles"
  | "profile_coverage"
  | "coverage_ascii"
  | "coverage_spanish"
  | "coverage_spanish_pending"
  | "coverage_bitmap"
  | "profile_suggested"
  | "verify_spanish"
  | "spanish_validation_pending"
  | "spanish_validation_confirm"
  | "spanish_validation_confirmed"
  | "reported_model"
  | "compatibility_report"
  | "compatibility_report_description"
  | "export_report"
  | "report_exported"
  | "print_diagnostics"
  | "no_print_diagnostics"
  | "diagnostic_cause"
  | "diagnostic_steps"
  | "test_sent"
  | "tray_open"
  | "tray_copy_token"
  | "tray_show_hosts"
  | "tray_print_test"
  | "tray_restart"
  | "tray_quit"
  | "bridge_hosts"
  | "print_failed"
  | "port_busy"
  | "port_busy_message"
  | "port_busy_detail"
  | "test_ticket_title"
  | "test_ticket_subtitle"
  | "test_ticket_printer"
  | "test_ticket_characters"
  | "printer_not_found"
  | "invalid_token"
  | "unsupported_print_block"
  | "invalid_request"
  | "operation_failed"
  | "operation_completed"
  | "printer_disabled"
  | "network_connected"
  | "network_unreachable"
  | "serial_detected"
  | "serial_not_detected"
  | "mac_usb_detected"
  | "mac_usb_not_detected"
  | "windows_printer_required"
  | "windows_usb_detected"
  | "windows_usb_not_detected"
  | "network_hosts_scanned"
  | "usb_detection_unsupported"
  | "mac_usb_not_found"
  | "mac_usb_unavailable"
  | "windows_usb_not_found"
  | "windows_usb_unavailable"
  | "bluetooth_pair_first"
  | "bluetooth_unavailable"
  | "image_omitted";

type Dictionary = Record<TranslationKey, string>;

const translations: Record<SupportedLanguage, Dictionary> = {
  es: {
    active: "Activo",
    app_description: "Puente local de impresión para tu punto de venta.",
    refresh: "Actualizar",
    advanced_settings: "Ajustes avanzados",
    bridge_host: "Host del puente",
    bridge_host_description: "Configúralo en el POS que enviará los trabajos.",
    access_token: "Token de acceso",
    access_token_description: "Obligatorio para las solicitudes de impresión.",
    copy: "Copiar",
    printers: "Impresoras",
    printers_description: "Conexiones configuradas en este equipo.",
    add: "Agregar",
    no_printers: "Todavía no hay impresoras configuradas.",
    enabled: "Habilitada",
    disabled: "Deshabilitada",
    no_recent_check: "Sin comprobación reciente",
    print_test: "Imprimir prueba",
    open_drawer: "Abrir cajón",
    edit: "Editar",
    delete: "Eliminar",
    delete_printer_confirm: "¿Eliminar {name}?",
    printer_detection: "Detección de impresoras",
    printer_detection_description:
      "Busca impresoras en la red, por USB o por Bluetooth/serial.",
    find_network: "Buscar en red",
    detect_usb: "Detectar USB",
    bluetooth_serial: "Bluetooth / serial",
    searching_network: "Buscando en red…",
    detecting_usb: "Detectando USB…",
    searching_devices: "Buscando dispositivos…",
    wait_for_scan: "Buscando dispositivos; espera a que termine.",
    latest_scan: "Resultados del último escaneo",
    devices_found: "{count} dispositivo(s) encontrado(s).",
    use_result: "Usar este resultado",
    no_devices: "No se encontraron dispositivos.",
    edit_printer: "Editar {name}",
    add_printer: "Agregar impresora",
    detected_connection_notice:
      "Datos de conexiÃ³n detectados; revÃ­salos antes de guardar.",
    discard_printer_changes_title: "Descartar cambios sin guardar",
    discard_printer_changes_description:
      "Los cambios realizados en esta impresora se perderÃ¡n.",
    discard_changes: "Descartar cambios",
    continue_editing: "Seguir editando",
    check_connection_before_saving: "Comprueba la conexión antes de guardarla.",
    connection_section: "Conexión",
    print_profile_section: "Perfil de impresión",
    operation_section: "Operación",
    advanced_printing: "Opciones avanzadas de impresión",
    name: "Nombre",
    type: "Tipo",
    width: "Ancho",
    network: "Red / Ethernet / Wi‑Fi",
    usb: "USB",
    bluetooth: "Bluetooth / serial",
    host: "IP / host",
    port: "Puerto",
    installed_windows_printer: "Impresora instalada en Windows",
    windows_printer_placeholder: "Nombre exacto de la impresora en Windows",
    path: "Puerto / path",
    open_drawer_setting: "Abrir cajón",
    printer_enabled: "Impresora habilitada",
    cancel: "Cancelar",
    close: "Cerrar",
    test_without_saving: "Probar sin guardar",
    save_printer: "Guardar impresora",
    validation_required: "Este campo es obligatorio.",
    validation_port: "Ingresa un puerto entre 1 y 65535.",
    validation_baud_rate: "Ingresa una velocidad válida.",
    validation_vendor_id: "Ingresa el Vendor ID.",
    validation_product_id: "Ingresa el Product ID.",
    validation_windows_printer:
      "Selecciona una impresora instalada en Windows.",
    validation_model_length: "El modelo no puede superar 160 caracteres.",
    validation_encoding: "Selecciona una codificación.",
    validation_character_table: "La tabla debe estar entre 0 y 255.",
    validation_origin: "Ingresa un origen HTTP o HTTPS sin ruta.",
    settings_description:
      "Configura el servicio local y los orígenes autorizados.",
    allowed_origins: "Orígenes autorizados",
    save_settings: "Guardar ajustes",
    language: "Idioma",
    language_system: "Sistema",
    language_spanish: "Español",
    language_english: "English",
    printing_language: "Idioma de impresión",
    profile_label: "Perfil: {profile}",
    profile_automatic: "Perfil automático",
    profile_custom: "personalizado",
    profile_auto_description:
      "El bridge elegirá el modo más seguro para esta impresora y este idioma.",
    profile_custom_description:
      "Esta impresora conserva tus ajustes técnicos y no recibe cambios del perfil automático.",
    encoding: "Codificación",
    character_table: "Tabla de caracteres ESC/POS",
    custom_character_table: "Personalizada…",
    custom_character_table_number: "Número de tabla personalizado",
    unicode_strategy: "Caracteres Unicode",
    unicode_auto: "Automático según el perfil",
    unicode_raster: "Usar bitmap para todo el texto",
    unicode_native: "Usar solo texto nativo",
    profile_custom_notice:
      "Los cambios técnicos desactivan las actualizaciones automáticas de este perfil.",
    profile_bitmap_fallback: "Bitmap seguro para caracteres no garantizados",
    profile_native_coverage: "Texto nativo según el perfil",
    profile_reset_for_language:
      "El idioma cambió; se restauró el perfil automático.",
    advanced_profile_notice:
      "Estos valores provienen del modelo seleccionado. Si cambias uno, se guardará un perfil personalizado.",
    printer_model: "Modelo de impresora",
    search_profiles: "Buscar modelo verificado…",
    profile_coverage: "Compatibilidad de texto",
    coverage_ascii: "ASCII nativo",
    coverage_spanish: "Español latino verificado",
    coverage_spanish_pending: "Español requiere verificación",
    coverage_bitmap: "Bitmap para caracteres no verificados",
    profile_suggested: "Perfil sugerido por USB",
    verify_spanish: "Verificar caracteres españoles",
    spanish_validation_pending:
      "Imprime la prueba y confirma solo si todos los caracteres españoles se leen correctamente.",
    spanish_validation_confirm: "Los caracteres se ven correctos",
    spanish_validation_confirmed:
      "La compatibilidad de caracteres españoles quedó confirmada para esta impresora.",
    reported_model: "Marca y modelo para el reporte (opcional)",
    compatibility_report: "Reporte de compatibilidad",
    compatibility_report_description:
      "No incluye IP, token, número de serie, nombre de impresora ni contenido de tickets.",
    export_report: "Copiar y descargar reporte",
    report_exported: "Reporte de compatibilidad copiado y descargado.",
    print_diagnostics: "Diagnóstico de impresión",
    no_print_diagnostics:
      "Aún no hay diagnósticos para esta impresora desde que se inició el bridge.",
    diagnostic_cause: "Causa técnica",
    diagnostic_steps: "Etapas registradas",
    test_sent:
      "Ticket de prueba enviado. Puedes guardar la impresora cuando estés conforme.",
    tray_open: "Abrir POS Ticket Bridge",
    tray_copy_token: "Copiar token",
    tray_show_hosts: "Mostrar hosts",
    tray_print_test: "Imprimir prueba",
    tray_restart: "Reiniciar servicio",
    tray_quit: "Salir",
    bridge_hosts: "Hosts del puente",
    print_failed: "No se pudo imprimir",
    port_busy: "Puerto ocupado",
    port_busy_message:
      "El puerto {port} ya está siendo usado por otra aplicación.",
    port_busy_detail:
      "Cierra la otra aplicación o cambia el puerto desde los ajustes de POS Ticket Bridge.",
    test_ticket_title: "POS TICKET BRIDGE",
    test_ticket_subtitle: "Prueba de impresión",
    test_ticket_printer: "Impresora: {name}",
    test_ticket_characters: "Caracteres: áéíóúüñÑ ¿¡ €",
    printer_not_found: "No se encontró la impresora {printerId}.",
    invalid_token: "Token de acceso no válido.",
    unsupported_print_block: "El bloque de impresión {type} no es compatible.",
    invalid_request: "La solicitud no es válida.",
    operation_failed: "No se pudo completar la operación.",
    operation_completed: "Operación completada",
    printer_disabled: "Impresora deshabilitada",
    network_connected: "Conectada a {host}:{port}",
    network_unreachable: "No responde {host}:{port}",
    serial_detected: "Puerto serial detectado; valida con ticket de prueba.",
    serial_not_detected: "No se detecta el puerto configurado",
    mac_usb_detected: "Dispositivo USB detectado en macOS",
    mac_usb_not_detected:
      "No se detecta el dispositivo USB configurado en macOS",
    windows_printer_required:
      "Configura una impresora instalada en Windows para usar USB.",
    windows_usb_detected: "Impresora USB detectada por Windows",
    windows_usb_not_detected: "Windows no detecta la impresora USB configurada",
    network_hosts_scanned: "Hosts escaneados en puerto 9100: {count}.",
    usb_detection_unsupported:
      "La detección USB del sistema solo está disponible en Windows y macOS.",
    mac_usb_not_found: "No se detectaron dispositivos USB de clase impresora.",
    mac_usb_unavailable: "USB no disponible en macOS",
    windows_usb_not_found:
      "No se detectaron impresoras USB instaladas en Windows.",
    windows_usb_unavailable:
      "No se pudo consultar las impresoras USB de Windows",
    bluetooth_pair_first:
      "Empareja la impresora con el sistema operativo antes de probarla.",
    bluetooth_unavailable: "Bluetooth/serial no disponible",
    image_omitted: "[Imagen omitida]",
  },
  en: {
    active: "Active",
    app_description: "Local printing bridge for your point of sale.",
    refresh: "Refresh",
    advanced_settings: "Advanced settings",
    bridge_host: "Bridge host",
    bridge_host_description: "Configure it in the POS that will send jobs.",
    access_token: "Access token",
    access_token_description: "Required for print requests.",
    copy: "Copy",
    printers: "Printers",
    printers_description: "Connections configured on this computer.",
    add: "Add",
    no_printers: "No printers have been configured yet.",
    enabled: "Enabled",
    disabled: "Disabled",
    no_recent_check: "No recent check",
    print_test: "Print test",
    open_drawer: "Open drawer",
    edit: "Edit",
    delete: "Delete",
    delete_printer_confirm: "Delete {name}?",
    printer_detection: "Printer detection",
    printer_detection_description:
      "Find printers on the network, over USB, or Bluetooth/serial.",
    find_network: "Find on network",
    detect_usb: "Detect USB",
    bluetooth_serial: "Bluetooth / serial",
    searching_network: "Searching network…",
    detecting_usb: "Detecting USB…",
    searching_devices: "Searching devices…",
    wait_for_scan: "Searching devices; wait for it to finish.",
    latest_scan: "Latest scan results",
    devices_found: "{count} device(s) found.",
    use_result: "Use this result",
    no_devices: "No devices found.",
    edit_printer: "Edit {name}",
    add_printer: "Add printer",
    detected_connection_notice:
      "Detected connection details; review them before saving.",
    discard_printer_changes_title: "Discard unsaved changes",
    discard_printer_changes_description:
      "The changes made to this printer will be lost.",
    discard_changes: "Discard changes",
    continue_editing: "Continue editing",
    check_connection_before_saving: "Check the connection before saving it.",
    connection_section: "Connection",
    print_profile_section: "Print profile",
    operation_section: "Operation",
    advanced_printing: "Advanced printing options",
    name: "Name",
    type: "Type",
    width: "Width",
    network: "Network / Ethernet / Wi‑Fi",
    usb: "USB",
    bluetooth: "Bluetooth / serial",
    host: "IP / host",
    port: "Port",
    installed_windows_printer: "Windows installed printer",
    windows_printer_placeholder: "Exact printer name in Windows",
    path: "Port / path",
    open_drawer_setting: "Open drawer",
    printer_enabled: "Printer enabled",
    cancel: "Cancel",
    close: "Close",
    test_without_saving: "Test without saving",
    save_printer: "Save printer",
    validation_required: "This field is required.",
    validation_port: "Enter a port between 1 and 65535.",
    validation_baud_rate: "Enter a valid baud rate.",
    validation_vendor_id: "Enter the Vendor ID.",
    validation_product_id: "Enter the Product ID.",
    validation_windows_printer: "Select a printer installed in Windows.",
    validation_model_length: "The model cannot exceed 160 characters.",
    validation_encoding: "Select an encoding.",
    validation_character_table: "The table must be between 0 and 255.",
    validation_origin: "Enter an HTTP or HTTPS origin without a path.",
    settings_description: "Configure the local service and allowed origins.",
    allowed_origins: "Allowed origins",
    save_settings: "Save settings",
    language: "Language",
    language_system: "System",
    language_spanish: "Español",
    language_english: "English",
    printing_language: "Print language",
    profile_label: "Profile: {profile}",
    profile_automatic: "Automatic profile",
    profile_custom: "custom",
    profile_auto_description:
      "The bridge will choose the safest mode for this printer and language.",
    profile_custom_description:
      "This printer keeps your technical settings and does not receive automatic profile changes.",
    encoding: "Encoding",
    character_table: "ESC/POS character table",
    custom_character_table: "Custom…",
    custom_character_table_number: "Custom table number",
    unicode_strategy: "Unicode characters",
    unicode_auto: "Automatic for this profile",
    unicode_raster: "Use bitmap for all text",
    unicode_native: "Use native text only",
    profile_custom_notice:
      "Technical changes disable automatic updates for this profile.",
    profile_bitmap_fallback: "Safe bitmap for unsupported characters",
    profile_native_coverage: "Native text for this profile",
    profile_reset_for_language:
      "The language changed; the automatic profile was restored.",
    advanced_profile_notice:
      "These values come from the selected model. Changing one saves a custom profile.",
    printer_model: "Printer model",
    search_profiles: "Search verified model…",
    profile_coverage: "Text compatibility",
    coverage_ascii: "Native ASCII",
    coverage_spanish: "Verified Spanish Latin",
    coverage_spanish_pending: "Spanish needs verification",
    coverage_bitmap: "Bitmap for unverified characters",
    profile_suggested: "USB suggested profile",
    verify_spanish: "Verify Spanish characters",
    spanish_validation_pending:
      "Print the test and confirm only if every Spanish character is readable.",
    spanish_validation_confirm: "Characters look correct",
    spanish_validation_confirmed:
      "Spanish character compatibility is confirmed for this printer.",
    reported_model: "Make and model for the report (optional)",
    compatibility_report: "Compatibility report",
    compatibility_report_description:
      "It does not include IP, token, serial number, printer name, or ticket contents.",
    export_report: "Copy and download report",
    report_exported: "Compatibility report copied and downloaded.",
    print_diagnostics: "Print diagnostics",
    no_print_diagnostics:
      "No diagnostics have been recorded for this printer since the bridge started.",
    diagnostic_cause: "Technical cause",
    diagnostic_steps: "Recorded stages",
    test_sent:
      "Test ticket sent. You can save the printer when you are satisfied.",
    tray_open: "Open POS Ticket Bridge",
    tray_copy_token: "Copy token",
    tray_show_hosts: "Show hosts",
    tray_print_test: "Print test",
    tray_restart: "Restart service",
    tray_quit: "Quit",
    bridge_hosts: "Bridge hosts",
    print_failed: "Unable to print",
    port_busy: "Port in use",
    port_busy_message:
      "Port {port} is already being used by another application.",
    port_busy_detail:
      "Close the other application or change the port from POS Ticket Bridge settings.",
    test_ticket_title: "POS TICKET BRIDGE",
    test_ticket_subtitle: "Print test",
    test_ticket_printer: "Printer: {name}",
    test_ticket_characters: "Characters: ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    printer_not_found: "Printer {printerId} was not found.",
    invalid_token: "Invalid access token.",
    unsupported_print_block: "Print block {type} is not supported.",
    invalid_request: "The request is invalid.",
    operation_failed: "The operation could not be completed.",
    operation_completed: "Operation completed",
    printer_disabled: "Printer is disabled",
    network_connected: "Connected to {host}:{port}",
    network_unreachable: "No response from {host}:{port}",
    serial_detected: "Serial port detected; validate it with a test ticket.",
    serial_not_detected: "The configured port was not detected",
    mac_usb_detected: "USB device detected on macOS",
    mac_usb_not_detected: "The configured USB device was not detected on macOS",
    windows_printer_required:
      "Configure a Windows installed printer to use USB.",
    windows_usb_detected: "USB printer detected by Windows",
    windows_usb_not_detected:
      "Windows does not detect the configured USB printer",
    network_hosts_scanned: "Hosts scanned on port 9100: {count}.",
    usb_detection_unsupported:
      "System USB detection is only available on Windows and macOS.",
    mac_usb_not_found: "No USB printer-class devices were found.",
    mac_usb_unavailable: "USB is unavailable on macOS",
    windows_usb_not_found: "No USB printers installed in Windows were found.",
    windows_usb_unavailable: "Unable to query Windows USB printers",
    bluetooth_pair_first:
      "Pair the printer with the operating system before testing it.",
    bluetooth_unavailable: "Bluetooth/serial is unavailable",
    image_omitted: "[Image omitted]",
  },
};

export const t = (
  language: SupportedLanguage,
  key: TranslationKey,
  params: MessageParams = {},
) =>
  translations[language][key].replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(params[name] ?? `{${name}}`),
  );

export const translateMessage = (
  language: SupportedLanguage,
  value?: BridgeMessage | null,
) => (value ? t(language, value.code as TranslationKey, value.params) : "");

export const testPrintTexts = (language: SupportedLanguage, name: string) => ({
  title: t(language, "test_ticket_title"),
  subtitle: t(language, "test_ticket_subtitle"),
  printer: t(language, "test_ticket_printer", { name }),
  characters: t(language, "test_ticket_characters"),
  imageOmitted: t(language, "image_omitted"),
});
export type TestPrintTexts = ReturnType<typeof testPrintTexts>;
