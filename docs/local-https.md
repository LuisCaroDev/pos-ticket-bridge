# HTTPS local

El bridge de Windows y macOS puede servir su API por HTTPS utilizando una CA exclusiva de esa instalación. WebPOS conserva el contrato de impresión y el token existente. No hay registro de dispositivos ni credenciales por dispositivo.

## Activación y uso

1. Abre la configuración del bridge y selecciona la interfaz de red y su IPv4 privada.
2. Activa **Activar HTTPS local**. El host mostrado será `https://<ipv4>:9977`, salvo que hayas cambiado el puerto principal.
3. Abre **Configurar dispositivo**, elige el sistema operativo y pulsa **Continuar**. El siguiente paso muestra el QR y las instrucciones; la descarga se habilita durante diez minutos. Al vencer, usa **Generar nuevo QR** para iniciar otra sesión. Volver a cambiar de sistema o cerrar el asistente detiene la descarga. La huella SHA-256 está en **Detalles técnicos**, plegados por defecto.
4. En el dispositivo cliente, escanea el QR o abre el enlace. Instala el certificado o perfil siguiendo la guía del bridge.
5. Abre `https://<ipv4>:9977/health` y comprueba que el navegador no muestra errores de certificado. Después prueba la impresión desde WebPOS con su host y token habituales.

El QR contiene únicamente la URL de descarga del certificado público. No incluye el token ni configura WebPOS. Si cambia el protocolo, puerto o IP del host que usa WebPOS, su dirección debe actualizarse mediante el mecanismo existente de WebPOS.

Al activar HTTPS se instala automáticamente la CA para el usuario actual: Root/CurrentUser en Windows y el llavero de inicio de sesión con confianza SSL en macOS. El sistema puede pedir confirmación o contraseña. Si falla, HTTPS permanece activo y se muestra **Confiar en este equipo** para reintentar. Pausar conserva la confianza; restablecer la elimina antes de borrar los certificados. El QR sigue siendo necesario en los otros dispositivos. Reinicia el navegador si conserva una advertencia anterior.

Se conserva una copia pública `local-https-ca.cer` para retirar exactamente esa CA incluso si el almacén cifrado se corrompe. Nunca se exportan claves privadas al almacén del sistema. La integración macOS requiere validación física en un Mac.

## Instalación por sistema operativo

| Cliente | Descarga | Confianza |
| --- | --- | --- |
| iOS / Safari | `/setup/ios.mobileconfig` | Instalar el perfil y activar la confianza total de la CA en Ajustes → General → Información → Ajustes de confianza de certificados. |
| Windows / Chrome, Edge o Brave | `/setup/windows.cer` | Importar en Usuario actual → Entidades de certificación raíz de confianza. Reiniciar el navegador si conserva el error anterior. |
| macOS / Safari | `/setup/macos.cer` | Importar en Acceso a Llaveros y establecer confianza para SSL en el certificado POS Ticket Bridge. |
| Android / Chrome | `/setup/android.cer` | Instalar como certificado de CA desde los ajustes de seguridad; los nombres de los menús varían según el fabricante. |

Guías oficiales: [iOS](https://support.apple.com/102390), [Windows](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/trusted-root-certification-authorities-certificate-store), [macOS](https://support.apple.com/guide/keychain-access/change-the-trust-settings-of-a-certificate-kyca11871/mac), [Android](https://support.google.com/pixelphone/answer/2844832).

El perfil iOS contiene exactamente un payload `com.apple.security.root` con el certificado público, sin ajustes de Wi-Fi, MDM, claves privadas ni credenciales. La huella SHA-256 del asistente identifica la CA de la instalación.

## Estados y recuperación

- **Sin configurar:** HTTP; todavía no hay CA.
- **Activo:** HTTPS en la interfaz seleccionada.
- **Pausado:** HTTP; CA, certificado, claves, token e impresoras se conservan.
- **Sin listener:** no se pudo escuchar. El estado HTTPS deseado y el error se muestran por separado; la configuración local sigue disponible.

Al reactivar se reutiliza la CA. El certificado del servidor se renueva si cambia la IPv4, es inválido o está próximo a vencer. La CA no cambia al renovar ese certificado.

Cada cinco segundos se comprueba la interfaz seleccionada. Si obtiene una única nueva IPv4 privada, se renueva el certificado automáticamente. Si desaparece o hay varias direcciones candidatas, el bridge solicita selección manual y no cambia automáticamente a HTTP ni a otra interfaz.

**Restablecer HTTPS local** exige confirmación, detiene las descargas y elimina los archivos de CA, certificados y claves HTTPS. Conserva el token de impresión, las impresoras y las preferencias generales. Para activar HTTPS después del restablecimiento, los clientes deberán instalar la nueva CA; el certificado anterior no se desinstala a distancia.

Las claves se cifran con Electron `safeStorage` y se guardan en `local-https.json` dentro de `userData`, separado de `config.json`. Se escribe mediante archivo temporal y reemplazo atómico. Si no se puede leer o descifrar, no se restablece silenciosamente el almacén ni se guardan claves en texto plano. La CA dura diez años y el certificado del servidor como máximo 365 días, sin superar la vigencia de la CA.

## Servidor temporal y red

El puerto **9978** está reservado para descargas y permanece cerrado fuera de una sesión. Solo admite GET/HEAD en las cuatro rutas anteriores y clientes de la subred de la IPv4 seleccionada. No confía en `X-Forwarded-For` ni expone rutas de impresión o administración.

La sesión termina a los diez minutos, incluyendo las conexiones abiertas. Cambiar de sistema operativo o descargar varias veces no amplía el plazo. También termina al cerrar el asistente o la ventana, pausar, restablecer, cambiar de IP/subred o salir de Electron. No se reabre después de reiniciar.

Si no hay conectividad, comprobar la red Wi-Fi, el aislamiento de clientes, los permisos de acceso a red local del navegador y el firewall de Windows para la aplicación en redes privadas. Si 9978 está ocupado, se muestra el error y no se elige otro puerto silenciosamente.

Se conservan CORS y `x-agent-token`. El preflight de red privada se autoriza solo para los orígenes permitidos. Las rutas administrativas recibidas desde la LAN requieren token incluso sin `Origin`. Las operaciones internas de Electron ejecutan las rutas de Fastify sin realizar solicitudes HTTP a sí mismo ni desactivar la verificación TLS.

## Verificación reproducible

```powershell
npm test
npm run lint
npm run test:https:electron
npm run make:win
```

`test:https:electron` usa tres procesos reales de Electron y un perfil de prueba aislado bajo `out/https-validation`. Comprueba cifrado DPAPI, persistencia de la CA, estados pausado/activo y eliminación después de restablecer. No instala certificados en Windows ni modifica el perfil real del bridge.

Las pruebas automatizadas comprueban además firma y extensiones X.509, SAN IP, TLS real con verificación de confianza, renovación, recuperación, perfil XML, cierre del servidor temporal, CORS, token incorrecto y controles de la UI.

### Validación física pendiente

Registrar versión de SO/navegador, IP, huella de la CA, instalación sin errores, `/health` sin advertencia TLS y resultado de impresión real:

| Cliente | Estado |
| --- | --- |
| iPhone / Safari | Pendiente con dispositivo físico. |
| Windows / Chrome y Edge | Pendiente de completar instalación de CA y prueba de impresión. |
| macOS / Safari | Pendiente con dispositivo físico. |
| Android / Chrome | Pendiente con dispositivo físico. |

Durante la validación local se comprobó que el listener de la instalación respondió 200 y validó correctamente con su propia CA para la IPv4 seleccionada. El navegador del usuario mostró falta de confianza y la CA no estaba en los almacenes de raíces de Windows; esto requiere completar la instalación del certificado, no regenerar la CA. No se ha dado por realizada una impresión física ni una prueba desde iPhone.

La verificación TypeScript global del repositorio tiene errores previos: su compilador fijado en 4.5 no interpreta los tipos actuales de las dependencias. La comparación con un compilador 5.9 debe distinguir esos errores de los introducidos por HTTPS; las pruebas, lint y el empaquetado se verifican por separado.

## Verificación de confianza automática

- Suite actual: 107 pruebas aprobadas; lint sin errores (171 advertencias). TypeScript 5.9.3: 38 diagnósticos existentes frente a 40 en la base, sin nuevos diagnósticos.
- Windows real: se intentó registrar la CA existente del bridge en Root/CurrentUser. Windows mostró «Security Warning»; la instalación no se completó dentro del plazo. La confianza real en el navegador sigue pendiente de aceptar el aviso y reabrir `/health`. No se rotó la CA ni se modificaron token o impresoras.
- macOS: comandos y manejo de cancelación cubiertos con pruebas simuladas; falta validar la instalación y Safari en hardware real.
- El alta usa X509Store de .NET en Windows y `security add-trusted-cert` con política SSL y dominio de usuario en macOS. Se respetan los avisos del sistema.

### Error macOS -25294 al importar el certificado

`errSecNoSuchKeychain` indica que no se encuentra el llavero de destino; no prueba que el certificado esté mal generado. Abrir Acceso a Llaveros → Archivo → Importar ítems → Opciones y elegir explícitamente **inicio de sesión (login)**. Después abrir la CA POS Ticket Bridge → Confiar → SSL → Confiar siempre y confirmar los cambios. No restablecer la CA del bridge para solucionar este error. Referencia: https://developer.apple.com/forums/thread/675290

## Guardado de ajustes

HTTPS, interfaz, puerto y orígenes se editan en Conexión, junto con un estado informativo de la conexión activa. Idioma e inicio automático están en Aplicación. Todos se aplican con Guardar cambios; cerrar o cancelar descarta el borrador. Un fallo conserva las ediciones y restaura la conexión anterior cuando sigue disponible. Los controles de guardado permanecen visibles al desplazarse. El diálogo se llama Ajustes y contiene únicamente preferencias. Confiar en este equipo aparece en la tarjeta de conexión cuando falta confianza. Restablecer HTTPS está en el menú de tres puntos de esa tarjeta y conserva su confirmación.

## Videos de ayuda

Configura las URLs públicas HTTPS en `.env` antes de ejecutar o empaquetar el bridge:

```dotenv
POS_BRIDGE_HTTPS_VIDEO_IOS=
POS_BRIDGE_HTTPS_VIDEO_ANDROID=
POS_BRIDGE_HTTPS_VIDEO_WINDOWS=
POS_BRIDGE_HTTPS_VIDEO_MACOS=
```

Cada URL se integra al compilar; para cambiarla en una distribución existente vuelve a empaquetar. También puede sobrescribirse mediante una variable de entorno del proceso al iniciar la aplicación. Una variable vacía oculta el video. No se incluyen otras variables del entorno en el bundle. El botón «¿Tienes problemas? Mira el video» aparece solo para sistemas con una URL HTTPS válida y abre el navegador predeterminado de la computadora donde se ejecuta el bridge.

Las instrucciones del asistente son breves por sistema, sin rutas detalladas de menús. «Probar conexión HTTPS» abre la dirección actual del listener; el enlace se mantiene visible y copiable para probar desde el dispositivo cliente. En Windows se pide cerrar y volver a abrir el navegador, no restablecer sus ajustes.

## Duración de la sesión de descarga

`POS_BRIDGE_HTTPS_SETUP_TTL_MS=1200000` configura veinte minutos para cada nueva sesión del QR. El valor se expresa en milisegundos y por defecto es 600000 (10 minutos). Se aceptan enteros positivos hasta 2147483647 (límite técnico del temporizador); valores vacíos o inválidos usan 600000. Esta variable sustituye el antiguo máximo fijo de diez minutos.

Configúrala en `.env` antes de iniciar el entorno de desarrollo o compilar el instalador. En una aplicación ya empaquetada, puede sobrescribirse mediante la variable de entorno del proceso antes de iniciar Electron. Reinicia la aplicación después de cambiarla. La duración se informa al asistente y la cuenta mm:ss usa el vencimiento real de la sesión. Las descargas no extienden el plazo; regenerar el QR inicia una sesión nueva. No cambia la vigencia de la CA ni del certificado TLS.

### Guías oficiales

La ayuda muestra video y guía oficial en la misma frase. Sin video configurado, muestra solo la guía. Las variables POS_BRIDGE_HTTPS_GUIDE_IOS, POS_BRIDGE_HTTPS_GUIDE_ANDROID, POS_BRIDGE_HTTPS_GUIDE_WINDOWS y POS_BRIDGE_HTTPS_GUIDE_MACOS permiten sustituir las guías incluidas. Admiten URLs HTTPS sin credenciales; un valor vacío o inválido conserva la guía oficial predeterminada. Se cargan desde .env al compilar (reiniciar desarrollo o volver a empaquetar) y pueden sobrescribirse mediante el entorno del proceso. Se abren en el navegador del equipo que ejecuta el bridge.
