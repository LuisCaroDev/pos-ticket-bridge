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
  | "https_trust_ready"
  | "https_trust_failed"
  | "https_trust_remove_failed"
  | "https_trust_retry"
  | "https_step_os"
  | "https_step_qr"
  | "https_step_os_hint"
  | "https_step_continue"
  | "https_step_back"
  | "https_qr_preparing"
  | "https_qr_regenerate"
  | "https_technical_details"
  | "https_scan_install"
  | "settings_https_draft_hint"
  | "settings_save_failed"
  | "settings_active_connection"
  | "settings_application_section"
  | "settings_advanced_section"
  | "settings_actions_hint"
  | "connection_actions"
  | "webpos_connection"
  | "https_actions"
  | "https_access_description"
  | "https_setup_other"
  | "https_scan_from_device"
  | "https_open_link_alternative"
  | "https_copy_download"
  | "https_test_connection"
  | "https_video_help"
  | "https_help_intro"
  | "https_help_or"
  | "https_guide_help"
  | "https_guide_help_only"
  | "https_video_unavailable"
  | "https_validate_instruction"
  | "https_copy_health"
  | "https_same_network"
  | "https_title"
  | "https_enable"
  | "https_settings_hint"
  | "https_interface"
  | "https_select_interface"
  | "https_interface_missing"
  | "https_store_invalid"
  | "https_storage_unavailable"
  | "https_decryption_failed"
  | "https_ca_expired"
  | "https_operation_failed"
  | "https_reserved_port"
  | "https_invalid_os"
  | "https_setup_unavailable"
  | "https_must_be_active"
  | "https_reset"
  | "https_reset_confirm"
  | "https_unconfigured"
  | "https_active"
  | "https_paused"
  | "https_stopped"
  | "https_state"
  | "https_transport"
  | "https_expiry"
  | "https_ca_expiry"
  | "https_fingerprint"
  | "https_retry"
  | "https_setup"
  | "https_setup_description"
  | "https_os"
  | "https_download_start"
  | "https_download_stop"
  | "https_download_time"
  | "https_download_expired"
  | "https_qr_alt"
  | "https_help"
  | "https_guide_ios"
  | "https_guide_android"
  | "https_guide_windows"
  | "https_guide_macos"
  | "https_health"
  | "https_lan_hint"
  | "https_ip_notice"
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
  | "baud_rate"
  | "baud_rate_help"
  | "validation_vendor_id"
  | "validation_product_id"
  | "validation_windows_printer"
  | "validation_model_length"
  | "validation_encoding"
  | "validation_character_table"
  | "validation_origin"
  | "settings_description"
  | "settings_language_section"
  | "settings_startup_section"
  | "settings_connection_section"
  | "auto_start"
  | "auto_start_description"
  | "auto_start_macos_move_to_applications"
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
  | "profile_verified"
  | "profile_personalized"
  | "profile_width"
  | "print_profile_selector"
  | "create_custom_profile"
  | "save_custom_profile"
  | "save_custom_profile_description"
  | "profile_changes_pending"
  | "local_profile_saved"
  | "profile_save_restart_required"
  | "profile_auto_description"
  | "profile_custom_description"
  | "encoding"
  | "encoding_help"
  | "character_table"
  | "character_table_help"
  | "custom_character_table"
  | "custom_character_table_number"
  | "unicode_strategy"
  | "unicode_strategy_help"
  | "unicode_auto"
  | "unicode_raster"
  | "unicode_native"
  | "profile_custom_notice"
  | "profile_bitmap_fallback"
  | "profile_native_coverage"
  | "profile_reset_for_language"
  | "discard_profile_for_language_title"
  | "discard_profile_for_language_description"
  | "keep_profile_settings"
  | "discard_profile_and_change_language"
  | "advanced_profile_notice"
  | "printer_model"
  | "search_profiles"
  | "profile_coverage"
  | "coverage_ascii"
  | "coverage_spanish"
  | "coverage_bitmap"
  | "profile_suggested"
  | "profile_brand_generic"
  | "character_profile_assistant"
  | "character_profile_assistant_description"
  | "character_profile_continue"
  | "character_profile_back_to_details"
  | "character_profile_tests_tab"
  | "character_profile_edit_set_tab"
  | "character_profile_select_set"
  | "character_profile_default_set"
  | "character_profile_import_label"
  | "character_profile_import_placeholder"
  | "character_profile_import"
  | "character_profile_import_error"
  | "character_profile_copy_ai_prompt"
  | "character_profile_test_label"
  | "character_profile_print_test"
  | "character_profile_technical_details"
  | "character_profile_status_pending"
  | "character_profile_status_printing"
  | "character_profile_status_sent"
  | "character_profile_status_error"
  | "character_profile_confirm_selection"
  | "character_profile_guided"
  | "character_profile_batch"
  | "character_profile_print_current"
  | "character_profile_next"
  | "character_profile_mark_correct"
  | "character_profile_batch_stopped"
  | "character_profile_trial_sent"
  | "character_profile_confirmed"
  | "character_profile_model_required"
  | "character_profile_export"
  | "character_profile_exported"
  | "character_profile_export_description"
  | "local_profile_import"
  | "local_profile_import_description"
  | "local_profile_paste"
  | "local_profile_drop_file"
  | "local_profile_select_file"
  | "local_profile_imported"
  | "local_profile_import_error"
  | "local_profile_export"
  | "local_profile_export_description"
  | "local_profile_copy"
  | "local_profile_download"
  | "local_profile_copied"
  | "local_profile_downloaded"
  | "local_profile_share"
  | "manage_local_profiles"
  | "manage_local_profiles_description"
  | "no_local_profiles"
  | "local_profile_usage"
  | "delete_local_profile"
  | "delete_local_profile_title"
  | "delete_local_profile_description"
  | "local_profile_deleted"
  | "character_profile_ai_prompt"
  | "character_profile_trial_title"
  | "character_profile_trial_profile"
  | "character_profile_trial_ascii"
  | "character_profile_trial_spanish"
  | "character_profile_trial_symbols"
  | "reported_model"
  | "reported_brand"
  | "compatibility_report"
  | "compatibility_report_description"
  | "model_information_section"
  | "export_report"
  | "report_exported"
  | "print_diagnostics"
  | "no_print_diagnostics"
  | "diagnostic_cause"
  | "diagnostic_steps"
  | "test_sent"
  | "print_sent_without_confirmation"
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
  | "test_ticket_ascii"
  | "test_ticket_spanish"
  | "test_ticket_symbols"
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
  | "image_omitted"
  | "invalid_character_profile_test_set"
  | "local_profile_export_unavailable";

type Dictionary = Record<TranslationKey, string>;

const translations: Record<SupportedLanguage, Dictionary> = {
  es: {
    https_trust_ready:
      "Este equipo confía en la CA del bridge. Si el navegador seguía abierto, reinícialo.",
    https_trust_failed:
      "No se pudo confirmar la confianza en este equipo. Reintenta la instalación y acepta el aviso del sistema si aparece.",
    https_trust_remove_failed:
      "No se pudo quitar la CA del sistema. Se conservaron los certificados para reintentar el restablecimiento.",
    https_trust_retry: "Confiar en este equipo",
    https_step_os: "Paso 1 de 2 · Elige el sistema operativo",
    https_step_qr: "Paso 2 de 2 · Configura {os}",
    https_step_os_hint:
      "Al continuar, aparecerá un QR disponible durante {time} (min:seg).",
    https_step_continue: "Continuar",
    https_step_back: "Cambiar sistema operativo",
    https_qr_preparing: "Preparando QR…",
    https_qr_regenerate: "Reactivar descarga",
    https_technical_details: "Detalles técnicos",
    https_scan_install: "Escanear e instalar",
    settings_https_draft_hint:
      "Se aplica al guardar. Desactivar HTTPS conserva la CA y la confianza instalada.",
    settings_save_failed:
      "No se pudieron guardar los cambios. Revisa la conexión e inténtalo otra vez; tus cambios siguen en el formulario.",
    settings_active_connection: "Conexión actual: {transport} · {host}",
    settings_application_section: "Aplicación",
    settings_advanced_section: "Avanzado",
    settings_actions_hint:
      "Estas acciones se ejecutan por separado. Guarda o cancela tus cambios antes de utilizarlas.",
    connection_actions: "Acciones de conexión",
    webpos_connection: "Conexión desde aplicaciones web",
    https_actions: "Acciones de HTTPS local",
    https_access_description:
      "Gestiona la confianza HTTPS en este equipo y en los dispositivos que van a imprimir.",
    https_setup_other: "Configurar otro dispositivo",
    https_scan_from_device:
      "Desde el dispositivo que va a imprimir, conectado a la misma red, escanea este QR",
    https_open_link_alternative: "o abre este enlace:",
    https_copy_download: "Copiar enlace de instalación",
    https_test_connection: "Probar conexión HTTPS",
    https_video_help: "Mira el video",
    https_help_intro: "¿Tienes problemas?",
    https_help_or: "o la",
    https_guide_help: "guía oficial",
    https_guide_help_only: "Consulta la guía oficial",
    https_video_unavailable:
      "El video de ayuda no está configurado para este sistema.",
    https_validate_instruction:
      "Abre {url} desde el dispositivo que va a imprimir para comprobar la conexión.",
    https_copy_health: "Copiar dirección de prueba HTTPS",
    https_same_network: "Conecta ambos dispositivos a la misma red.",
    https_title: "HTTPS local",
    https_enable: "Activar HTTPS local",
    https_settings_hint:
      "Al activar HTTPS se instala la CA en este equipo para el usuario actual. Acepta el aviso del sistema si aparece. Al desactivarlo se conservan los certificados y la confianza.",
    https_interface: "Interfaz de red e IPv4",
    https_select_interface:
      "Selecciona una interfaz de red privada para HTTPS.",
    https_interface_missing:
      "La IPv4 seleccionada ya no está disponible. Selecciona una interfaz para recuperar HTTPS.",
    https_store_invalid:
      "No se puede leer o validar la configuración HTTPS. Los archivos se han conservado. Reintenta o restablece HTTPS.",
    https_storage_unavailable:
      "El cifrado seguro de Windows no está disponible. No se guardaron claves sin cifrar.",
    https_decryption_failed:
      "No se pueden descifrar las claves HTTPS con este usuario de Windows. Los archivos se han conservado.",
    https_ca_expired:
      "La CA venció o todavía no es válida. Revisa la fecha del equipo; si venció, restablece HTTPS e instala la nueva CA.",
    https_operation_failed:
      "No se pudo actualizar HTTPS. Revisa la interfaz seleccionada y que el puerto esté disponible.",
    https_reserved_port:
      "El puerto 9978 está reservado para configurar dispositivos.",
    https_invalid_os: "Selecciona un sistema operativo compatible.",
    https_setup_unavailable:
      "No se pudo iniciar la descarga en el puerto {port}. Revisa que esté disponible y que la interfaz esté conectada.",
    https_must_be_active: "Activa HTTPS antes de configurar un dispositivo.",
    https_reset: "Restablecer HTTPS local",
    https_reset_confirm:
      "Se quitará la confianza de esta CA en el usuario actual y se eliminarán la CA y las claves y certificados HTTPS. El bridge volverá a HTTP y conservará el token y las impresoras. Para volver a usar HTTPS deberás instalar la nueva CA en los dispositivos. ¿Continuar?",
    https_unconfigured: "Sin configurar",
    https_active: "Activo",
    https_paused: "Pausado",
    https_stopped: "Sin listener",
    https_state: "Estado HTTPS: {state}",
    https_transport: "Transporte: {transport}",
    https_expiry: "Certificado válido hasta: {date}",
    https_ca_expiry: "CA válida hasta: {date}",
    https_fingerprint: "Huella SHA-256 de la CA",
    https_retry: "Reintentar conexión",
    https_setup: "Configurar dispositivo",
    https_setup_description:
      "Instala la CA para que este dispositivo confíe en el HTTPS del bridge. Elige su sistema operativo y abre la descarga desde la misma red.",
    https_os: "Sistema operativo del dispositivo",
    https_download_start: "Iniciar descarga temporal",
    https_download_stop: "Detener descarga",
    https_download_time: "Enlace disponible: {time}",
    https_download_expired: "La sesión de descarga ha vencido.",
    https_qr_alt: "QR para descargar el certificado público del bridge",
    https_help: "Abrir guía oficial",
    https_guide_ios:
      "Instala el perfil descargado.\nActiva la confianza total para la CA del bridge.",
    https_guide_android:
      "Instala el certificado como CA desde los ajustes de seguridad del dispositivo.",
    https_guide_windows:
      "Instala la CA como raíz de confianza.\nCierra y vuelve a abrir el navegador.",
    https_guide_macos:
      "Instala la CA en Acceso a Llaveros.\nActiva Confiar siempre para SSL en ese certificado.",
    https_health: "Dirección para comprobar HTTPS",
    https_lan_hint:
      "Si no abre, comprueba que ambos equipos estén en la misma red, sin aislamiento de clientes, y que el firewall de Windows permita el bridge en redes privadas.",
    https_ip_notice:
      "Si cambia la IP del bridge, actualiza el host en la aplicación web que envía las impresiones. La CA sigue siendo la misma.",
    active: "Activo",
    app_description: "Imprime tickets, comandas y otros documentos desde aplicaciones web.",
    refresh: "Actualizar",
    advanced_settings: "Ajustes",
    bridge_host: "Host del puente",
    bridge_host_description: "Configúralo en la aplicación web que enviará las impresiones.",
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
      "Datos de conexión detectados; revísalos antes de guardar.",
    discard_printer_changes_title: "Descartar cambios sin guardar",
    discard_printer_changes_description:
      "Los cambios realizados en esta impresora se perderán.",
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
    baud_rate: "Velocidad de comunicación",
    baud_rate_help:
      "Velocidad de conexión por Bluetooth en baudios. Debe coincidir con la configurada en la impresora; normalmente es 9600.",
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
    settings_language_section: "Idioma",
    settings_startup_section: "Inicio automático",
    settings_connection_section: "Conexión del Bridge",
    auto_start: "Iniciar Bridge automáticamente",
    auto_start_description:
      "El Bridge se ejecutará en segundo plano al iniciar sesión.",
    auto_start_macos_move_to_applications:
      'Mueve POS Ticket Bridge a Aplicaciones, ejecuta xattr -dr com.apple.quarantine "/Applications/POS Ticket Bridge.app" y ábrelo de nuevo para activar el inicio automático.',
    allowed_origins: "Orígenes autorizados",
    save_settings: "Guardar cambios",
    language: "Idioma",
    language_system: "Sistema",
    language_spanish: "Español",
    language_english: "English",
    printing_language: "Idioma de impresión",
    profile_label: "Perfil: {profile}",
    profile_automatic: "Perfil automático",
    profile_custom: "personalizado",
    profile_verified: "Verificado",
    profile_personalized: "Personalizado",
    profile_width: " · {width} mm",
    print_profile_selector: "Perfil de impresión",
    create_custom_profile: "Crear perfil personalizado",
    save_custom_profile: "Guardar perfil",
    save_custom_profile_description:
      "Marca y modelo identifican este perfil de {width} mm.",
    profile_changes_pending: "Cambios sin guardar",
    local_profile_saved: "Perfil guardado y disponible para reutilizar.",
    profile_save_restart_required:
      "Reinicia la aplicación para poder guardar perfiles personalizados.",
    profile_auto_description:
      "El bridge elegirá el modo más seguro para esta impresora y este idioma.",
    profile_custom_description:
      "Esta impresora conserva tus ajustes técnicos y no recibe cambios del perfil automático.",
    encoding: "Codificación",
    encoding_help:
      "Define cómo la impresora convierte los caracteres en bytes. Usa el valor recomendado para tu modelo.",
    character_table: "Tabla de caracteres ESC/POS",
    character_table_help:
      "Número de tabla ESC/POS que la impresora usa para interpretar caracteres, acentos y símbolos.",
    custom_character_table: "Personalizada…",
    custom_character_table_number: "Número de tabla personalizado",
    unicode_strategy: "Caracteres Unicode",
    unicode_strategy_help:
      "Decide cómo imprimir caracteres fuera de la tabla elegida: automáticamente, como imagen o de forma nativa.",
    unicode_auto: "Automático según el perfil",
    unicode_raster: "Usar bitmap para todo el texto",
    unicode_native: "Usar solo texto nativo",
    profile_custom_notice:
      "Los cambios técnicos desactivan las actualizaciones automáticas de este perfil.",
    profile_bitmap_fallback: "Bitmap seguro para caracteres no garantizados",
    profile_native_coverage: "Texto nativo según el perfil",
    profile_reset_for_language:
      "El idioma cambió; se restauró el perfil automático.",
    discard_profile_for_language_title: "Descartar ajustes del perfil",
    discard_profile_for_language_description:
      "Los ajustes técnicos del perfil que aún no se guardaron se descartarán y se aplicará el perfil automático para el nuevo idioma.",
    keep_profile_settings: "Conservar ajustes",
    discard_profile_and_change_language: "Descartar y cambiar idioma",
    advanced_profile_notice:
      "Estos valores provienen del modelo seleccionado. Si cambias uno, se guardará un perfil personalizado.",
    printer_model: "Modelo de impresora",
    search_profiles: "Buscar modelo verificado…",
    profile_coverage: "Compatibilidad de texto",
    coverage_ascii: "ASCII nativo",
    coverage_spanish: "Español latino verificado",
    coverage_bitmap: "Bitmap para caracteres no verificados",
    profile_suggested: "Perfil sugerido por USB",
    profile_brand_generic: "Modelos genéricos",
    character_profile_assistant:
      "Encuentra el perfil correcto para tu impresora",
    character_profile_assistant_description:
      "Imprime una prueba y elige el ticket cuyos caracteres se ven correctamente.",
    character_profile_continue: "Continuar",
    character_profile_back_to_details: "Editar marca y modelo",
    character_profile_tests_tab: "Probar perfiles",
    character_profile_edit_set_tab: "Editar set",
    character_profile_select_set: "Selecciona un set de pruebas",
    character_profile_default_set: "Pruebas recomendadas",
    character_profile_import_label: "Pega un set de pruebas",
    character_profile_import_placeholder:
      '{"version":1,"name":"Mi impresora","candidates":[{"id":"CP858-T19","encoding":"CP858","codeTable":19}]}',
    character_profile_import: "Usar este set",
    character_profile_import_error:
      "El set debe ser JSON válido con 1 a 20 candidatos únicos, codificación y tabla entre 0 y 255.",
    character_profile_copy_ai_prompt: "Copiar instrucciones para IA",
    character_profile_test_label: "Prueba {number} · {id}",
    character_profile_print_test: "Imprimir {test}",
    character_profile_technical_details:
      "Detalles técnicos: codificación {encoding}, tabla {table}",
    character_profile_status_pending: "Pendiente",
    character_profile_status_printing: "Imprimiendo…",
    character_profile_status_sent: "Ticket enviado",
    character_profile_status_error: "No se pudo imprimir",
    character_profile_confirm_selection: "Usar perfil seleccionado",
    character_profile_guided: "Modo guiado",
    character_profile_batch: "Imprimir todas las pruebas",
    character_profile_print_current: "Imprimir candidato actual",
    character_profile_next: "No es correcto; siguiente",
    character_profile_mark_correct: "Este ticket se ve correcto: {test}",
    character_profile_batch_stopped:
      "Las pruebas se detuvieron porque una no pudo imprimirse.",
    character_profile_trial_sent:
      "Ticket enviado. Revisa los caracteres españoles antes de continuar.",
    character_profile_confirmed:
      "El perfil fue confirmado y ya está disponible para reutilizar.",
    character_profile_model_required:
      "Ingresa la marca y el modelo antes de confirmar un perfil local.",
    character_profile_export: "Copiar y descargar perfil local",
    character_profile_exported:
      "Perfil local copiado y descargado sin datos de conexión.",
    character_profile_export_description:
      "Comparte este archivo con el equipo para que pueda evaluar su incorporación al catálogo.",
    local_profile_import: "Importar perfil",
    local_profile_import_description:
      "Pega un perfil copiado o arrastra un archivo JSON.",
    local_profile_paste: "Pegar perfil",
    local_profile_drop_file: "Arrastra o selecciona un archivo JSON",
    local_profile_select_file: "Seleccionar archivo JSON",
    local_profile_imported:
      "Perfil importado y disponible para esta impresora.",
    local_profile_import_error: "No se pudo importar el perfil compartido.",
    local_profile_export: "Exportar perfil",
    local_profile_export_description:
      "Elige si quieres copiar el perfil o descargar su archivo JSON.",
    local_profile_copy: "Copiar perfil",
    local_profile_download: "Descargar archivo",
    local_profile_copied: "Perfil copiado sin datos de conexión.",
    local_profile_downloaded:
      "Archivo de perfil descargado sin datos de conexión.",
    local_profile_share: "Compartir perfil",
    manage_local_profiles: "Administrar perfiles personalizados",
    manage_local_profiles_description:
      "Elimina perfiles locales que ya no necesitas. Las impresoras que los usen conservarán sus ajustes actuales.",
    no_local_profiles: "Aún no hay perfiles personalizados guardados.",
    local_profile_usage: "En uso por {count} impresoras",
    delete_local_profile: "Eliminar perfil",
    delete_local_profile_title: "¿Eliminar este perfil personalizado?",
    delete_local_profile_description:
      "Se eliminará {profile}. {count} impresoras conservarán sus ajustes actuales como perfiles independientes.",
    local_profile_deleted: "Perfil personalizado eliminado.",
    character_profile_ai_prompt:
      'Genera un set de pruebas ESC/POS para caracteres españoles para la impresora {model}. Devuelve solo JSON, sin Markdown ni comandos. Esquema exacto: {"version":1,"name":"Nombre del set","candidates":[{"id":"ASCII-SIN-ESPACIOS","encoding":"CP858","codeTable":19}]}. Incluye entre 1 y 20 candidatos únicos; id solo usa letras, números, punto, guión o guion bajo; codeTable es entero de 0 a 255.',
    character_profile_trial_title: "PRUEBA DE IMPRESIÓN",
    character_profile_trial_profile: "PRUEBA {id}",
    character_profile_trial_ascii:
      "ASCII: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,:;!?+-*/",
    character_profile_trial_spanish: "Español: áéíóúüñÑ ÁÉÍÓÚÜ ¿¡",
    character_profile_trial_symbols:
      "Símbolos: € $ S/ % # @ & / \\ ( ) [ ] { }",
    reported_brand: "Marca",
    reported_model: "Modelo",
    compatibility_report: "Reporte de compatibilidad",
    compatibility_report_description:
      "No incluye IP, token, número de serie, nombre de impresora ni contenido de tickets.",
    model_information_section: "Información del modelo",
    export_report: "Copiar y descargar reporte",
    report_exported: "Reporte de compatibilidad copiado y descargado.",
    print_diagnostics: "Diagnóstico de impresión",
    no_print_diagnostics:
      "Aún no hay diagnósticos para esta impresora desde que se inició el bridge.",
    diagnostic_cause: "Causa técnica",
    diagnostic_steps: "Etapas registradas",
    test_sent:
      "Ticket de prueba enviado. Puedes guardar la impresora cuando estés conforme.",
    print_sent_without_confirmation:
      "Ticket enviado, pero la impresora no confirmó la recepción.",
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
    test_ticket_ascii:
      "ASCII: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,:;!?+-*/",
    test_ticket_spanish: "Español: áéíóúüñÑ ÁÉÍÓÚÜ ¿¡",
    test_ticket_symbols: "Símbolos: € $ S/ % # @ & / \\ ( ) [ ] { }",
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
    invalid_character_profile_test_set:
      "El set de pruebas de perfiles de caracteres no es válido.",
    local_profile_export_unavailable:
      "Confirma un perfil local y escribe el modelo antes de exportarlo.",
  },
  en: {
    https_trust_ready:
      "This computer trusts the bridge CA. Restart the browser if it was already open.",
    https_trust_failed:
      "Trust on this computer could not be confirmed. Retry installation and accept the system prompt if shown.",
    https_trust_remove_failed:
      "Could not remove the system CA. Certificates were preserved so you can retry resetting.",
    https_trust_retry: "Trust this computer",
    https_step_os: "Step 1 of 2 · Choose the operating system",
    https_step_qr: "Step 2 of 2 · Set up {os}",
    https_step_os_hint:
      "Continue to show a QR code available for {time} (min:sec).",
    https_step_continue: "Continue",
    https_step_back: "Change operating system",
    https_qr_preparing: "Preparing QR…",
    https_qr_regenerate: "Reactivate download",
    https_technical_details: "Technical details",
    https_scan_install: "Scan and install",
    settings_https_draft_hint:
      "Applied when saved. Turning HTTPS off preserves the CA and installed trust.",
    settings_save_failed:
      "Could not save changes. Check the connection and retry; your edits remain in the form.",
    settings_active_connection: "Current connection: {transport} · {host}",
    settings_application_section: "Application",
    settings_advanced_section: "Advanced",
    settings_actions_hint:
      "These actions run separately. Save or cancel your edits before using them.",
    connection_actions: "Connection actions",
    webpos_connection: "Web application connection",
    https_actions: "Local HTTPS actions",
    https_access_description:
      "Manage HTTPS trust on this computer and on the devices that will print.",
    https_setup_other: "Set up another device",
    https_scan_from_device:
      "On the device that will print, connected to the same network, scan this QR code",
    https_open_link_alternative: "or open this link:",
    https_copy_download: "Copy setup link",
    https_test_connection: "Test HTTPS connection",
    https_video_help: "Watch the video",
    https_help_intro: "Having trouble?",
    https_help_or: "or read the",
    https_guide_help: "official guide",
    https_guide_help_only: "Read the official guide",
    https_video_unavailable:
      "The help video is not configured for this system.",
    https_validate_instruction:
      "Open {url} on the device that will print to check the connection.",
    https_copy_health: "Copy HTTPS test address",
    https_same_network: "Connect both devices to the same network.",
    https_title: "Local HTTPS",
    https_enable: "Enable local HTTPS",
    https_settings_hint:
      "Enabling HTTPS installs the CA on this computer for the current user. Accept the system prompt if shown. Turning it off preserves certificates and trust.",
    https_interface: "Network interface and IPv4",
    https_select_interface: "Select a private network interface for HTTPS.",
    https_interface_missing:
      "The selected IPv4 is no longer available. Select an interface to restore HTTPS.",
    https_store_invalid:
      "Cannot read or validate the HTTPS configuration. The files have been preserved. Retry or reset HTTPS.",
    https_storage_unavailable:
      "Windows secure encryption is unavailable. No unencrypted keys were saved.",
    https_decryption_failed:
      "Cannot decrypt the HTTPS keys with this Windows user. The files have been preserved.",
    https_ca_expired:
      "The CA has expired or is not yet valid. Check the computer clock; if expired, reset HTTPS and install the new CA.",
    https_operation_failed:
      "Could not update HTTPS. Check the selected interface and that the port is available.",
    https_reserved_port: "Port 9978 is reserved for device setup.",
    https_invalid_os: "Select a supported operating system.",
    https_setup_unavailable:
      "Could not start downloads on port {port}. Check that it is available and the interface is connected.",
    https_must_be_active: "Enable HTTPS before setting up a device.",
    https_reset: "Reset local HTTPS",
    https_reset_confirm:
      "Trust for this CA will be removed for the current user, and the CA, HTTPS keys and certificates will be deleted. The bridge will return to HTTP and keep its token and printers. To use HTTPS again, you must install the new CA on your devices. Continue?",
    https_unconfigured: "Not configured",
    https_active: "Active",
    https_paused: "Paused",
    https_stopped: "Listener stopped",
    https_state: "HTTPS state: {state}",
    https_transport: "Transport: {transport}",
    https_expiry: "Certificate valid until: {date}",
    https_ca_expiry: "CA valid until: {date}",
    https_fingerprint: "CA SHA-256 fingerprint",
    https_retry: "Retry connection",
    https_setup: "Set up device",
    https_setup_description:
      "Install the CA so this device trusts the bridge's HTTPS. Choose its operating system and open the download from the same network.",
    https_os: "Device operating system",
    https_download_start: "Start temporary download",
    https_download_stop: "Stop download",
    https_download_time: "Link available for {time}",
    https_download_expired: "The download session has expired.",
    https_qr_alt: "QR to download the bridge's public certificate",
    https_help: "Open official guide",
    https_guide_ios:
      "Install the downloaded profile.\nEnable full trust for the bridge CA.",
    https_guide_android:
      "Install the certificate as a CA from the device security settings.",
    https_guide_windows:
      "Install the CA as a trusted root.\nClose and reopen your browser.",
    https_guide_macos:
      "Install the CA in Keychain Access.\nSet SSL to Always Trust for that certificate.",
    https_health: "Address to check HTTPS",
    https_lan_hint:
      "If it does not open, check that both devices are on the same network without client isolation, and that Windows Firewall allows the bridge on private networks.",
    https_ip_notice:
      "If the bridge IP changes, update the host in the web application that sends print jobs. The CA stays the same.",
    active: "Active",
    app_description: "Print receipts, kitchen tickets, and other documents from web applications.",
    refresh: "Refresh",
    advanced_settings: "Settings",
    bridge_host: "Bridge host",
    bridge_host_description: "Configure it in the web application that will send print jobs.",
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
    baud_rate: "Baud rate",
    baud_rate_help:
      "Bluetooth connection speed in baud. It must match the printer setting; 9600 is common.",
    validation_vendor_id: "Enter the Vendor ID.",
    validation_product_id: "Enter the Product ID.",
    validation_windows_printer: "Select a printer installed in Windows.",
    validation_model_length: "The model cannot exceed 160 characters.",
    validation_encoding: "Select an encoding.",
    validation_character_table: "The table must be between 0 and 255.",
    validation_origin: "Enter an HTTP or HTTPS origin without a path.",
    settings_description: "Configure the local service and allowed origins.",
    settings_language_section: "Language",
    settings_startup_section: "Automatic startup",
    settings_connection_section: "Bridge connection",
    auto_start: "Start Bridge automatically",
    auto_start_description:
      "The Bridge will run in the background when you sign in.",
    auto_start_macos_move_to_applications:
      'Move POS Ticket Bridge to Applications, run xattr -dr com.apple.quarantine "/Applications/POS Ticket Bridge.app", and open it again to enable automatic startup.',
    allowed_origins: "Allowed origins",
    save_settings: "Save changes",
    language: "Language",
    language_system: "System",
    language_spanish: "Español",
    language_english: "English",
    printing_language: "Print language",
    profile_label: "Profile: {profile}",
    profile_automatic: "Automatic profile",
    profile_custom: "custom",
    profile_verified: "Verified",
    profile_personalized: "Custom",
    profile_width: " · {width} mm",
    print_profile_selector: "Print profile",
    create_custom_profile: "Create custom profile",
    save_custom_profile: "Save profile",
    save_custom_profile_description:
      "Make and model identify this {width} mm profile.",
    profile_changes_pending: "Unsaved changes",
    local_profile_saved: "Profile saved and available to reuse.",
    profile_save_restart_required:
      "Restart the application to save custom profiles.",
    profile_auto_description:
      "The bridge will choose the safest mode for this printer and language.",
    profile_custom_description:
      "This printer keeps your technical settings and does not receive automatic profile changes.",
    encoding: "Encoding",
    encoding_help:
      "Controls how the printer converts characters to bytes. Use the value recommended for your model.",
    character_table: "ESC/POS character table",
    character_table_help:
      "ESC/POS table number the printer uses for characters, accents, and symbols.",
    custom_character_table: "Custom…",
    custom_character_table_number: "Custom table number",
    unicode_strategy: "Unicode characters",
    unicode_strategy_help:
      "Controls how characters outside the selected table are printed: automatically, as an image, or natively.",
    unicode_auto: "Automatic for this profile",
    unicode_raster: "Use bitmap for all text",
    unicode_native: "Use native text only",
    profile_custom_notice:
      "Technical changes disable automatic updates for this profile.",
    profile_bitmap_fallback: "Safe bitmap for unsupported characters",
    profile_native_coverage: "Native text for this profile",
    profile_reset_for_language:
      "The language changed; the automatic profile was restored.",
    discard_profile_for_language_title: "Discard profile settings",
    discard_profile_for_language_description:
      "Unsaved technical profile settings will be discarded and the automatic profile for the new language will be applied.",
    keep_profile_settings: "Keep settings",
    discard_profile_and_change_language: "Discard and change language",
    advanced_profile_notice:
      "These values come from the selected model. Changing one saves a custom profile.",
    printer_model: "Printer model",
    search_profiles: "Search verified model…",
    profile_coverage: "Text compatibility",
    coverage_ascii: "Native ASCII",
    coverage_spanish: "Verified Spanish Latin",
    coverage_bitmap: "Bitmap for unverified characters",
    profile_suggested: "USB suggested profile",
    profile_brand_generic: "Generic models",
    character_profile_assistant: "Find the right profile for your printer",
    character_profile_assistant_description:
      "Print a test and choose the ticket whose characters look correct.",
    character_profile_continue: "Continue",
    character_profile_back_to_details: "Edit make and model",
    character_profile_tests_tab: "Test profiles",
    character_profile_edit_set_tab: "Edit set",
    character_profile_select_set: "Choose a test set",
    character_profile_default_set: "Recommended tests",
    character_profile_import_label: "Paste a test set",
    character_profile_import_placeholder:
      '{"version":1,"name":"My printer","candidates":[{"id":"CP858-T19","encoding":"CP858","codeTable":19}]}',
    character_profile_import: "Use this set",
    character_profile_import_error:
      "The set must be valid JSON with 1 to 20 unique candidates, an encoding, and a table from 0 to 255.",
    character_profile_copy_ai_prompt: "Copy AI instructions",
    character_profile_test_label: "Test {number} · {id}",
    character_profile_print_test: "Print {test}",
    character_profile_technical_details:
      "Technical details: encoding {encoding}, table {table}",
    character_profile_status_pending: "Pending",
    character_profile_status_printing: "Printing…",
    character_profile_status_sent: "Ticket sent",
    character_profile_status_error: "Could not print",
    character_profile_confirm_selection: "Use selected profile",
    character_profile_guided: "Guided mode",
    character_profile_batch: "Print all tests",
    character_profile_print_current: "Print current candidate",
    character_profile_next: "Not correct; next",
    character_profile_mark_correct: "This ticket looks correct: {test}",
    character_profile_batch_stopped:
      "The tests stopped because one could not be printed.",
    character_profile_trial_sent:
      "Ticket sent. Check the Spanish characters before continuing.",
    character_profile_confirmed:
      "The profile was confirmed and is ready to reuse.",
    character_profile_model_required:
      "Enter the make and model before confirming a local profile.",
    character_profile_export: "Copy and download local profile",
    character_profile_exported:
      "Local profile copied and downloaded without connection data.",
    character_profile_export_description:
      "Share this file with the team so it can evaluate adding it to the catalog.",
    local_profile_import: "Import profile",
    local_profile_import_description:
      "Paste a copied profile or drag a JSON file here.",
    local_profile_paste: "Paste profile",
    local_profile_drop_file: "Drag or choose a JSON file",
    local_profile_select_file: "Choose JSON file",
    local_profile_imported: "Profile imported and available for this printer.",
    local_profile_import_error: "The shared profile could not be imported.",
    local_profile_export: "Export profile",
    local_profile_export_description:
      "Choose whether to copy the profile or download its JSON file.",
    local_profile_copy: "Copy profile",
    local_profile_download: "Download file",
    local_profile_copied: "Profile copied without connection data.",
    local_profile_downloaded:
      "Profile file downloaded without connection data.",
    local_profile_share: "Share profile",
    manage_local_profiles: "Manage custom profiles",
    manage_local_profiles_description:
      "Delete local profiles you no longer need. Printers that use them keep their current settings.",
    no_local_profiles: "There are no saved custom profiles yet.",
    local_profile_usage: "Used by {count} printers",
    delete_local_profile: "Delete profile",
    delete_local_profile_title: "Delete this custom profile?",
    delete_local_profile_description:
      "{profile} will be deleted. {count} printers will keep their current settings as independent profiles.",
    local_profile_deleted: "Custom profile deleted.",
    character_profile_ai_prompt:
      'Generate an ESC/POS test set for Spanish characters for the printer {model}. Return only JSON, without Markdown or commands. Exact schema: {"version":1,"name":"Set name","candidates":[{"id":"ASCII-NO-SPACES","encoding":"CP858","codeTable":19}]}. Include 1 to 20 unique candidates; id may only use letters, numbers, dot, hyphen, or underscore; codeTable is an integer from 0 to 255.',
    character_profile_trial_title: "PRINT TEST",
    character_profile_trial_profile: "TEST {id}",
    character_profile_trial_ascii:
      "ASCII: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,:;!?+-*/",
    character_profile_trial_spanish: "Spanish: áéíóúüñÑ ÁÉÍÓÚÜ ¿¡",
    character_profile_trial_symbols: "Symbols: € $ S/ % # @ & / \\ ( ) [ ] { }",
    reported_brand: "Make",
    reported_model: "Model",
    compatibility_report: "Compatibility report",
    compatibility_report_description:
      "It does not include IP, token, serial number, printer name, or ticket contents.",
    model_information_section: "Model information",
    export_report: "Copy and download report",
    report_exported: "Compatibility report copied and downloaded.",
    print_diagnostics: "Print diagnostics",
    no_print_diagnostics:
      "No diagnostics have been recorded for this printer since the bridge started.",
    diagnostic_cause: "Technical cause",
    diagnostic_steps: "Recorded stages",
    test_sent:
      "Test ticket sent. You can save the printer when you are satisfied.",
    print_sent_without_confirmation:
      "Ticket sent, but the printer did not confirm receipt.",
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
    test_ticket_ascii:
      "ASCII: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,:;!?+-*/",
    test_ticket_spanish: "Spanish: áéíóúüñÑ ÁÉÍÓÚÜ ¿¡",
    test_ticket_symbols: "Symbols: € $ S/ % # @ & / \\ ( ) [ ] { }",
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
    invalid_character_profile_test_set:
      "The character profile test set is invalid.",
    local_profile_export_unavailable:
      "Confirm a local profile and enter the model before exporting it.",
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
  ascii: t(language, "test_ticket_ascii"),
  spanish: language === "es" ? t(language, "test_ticket_spanish") : undefined,
  symbols: t(language, "test_ticket_symbols"),
  imageOmitted: t(language, "image_omitted"),
});
export type TestPrintTexts = ReturnType<typeof testPrintTexts>;

export const characterProfileTrialTexts = (
  language: SupportedLanguage,
  candidate: { id: string; encoding: string; codeTable: number },
) => ({
  title: t(language, "character_profile_trial_title"),
  profile: t(language, "character_profile_trial_profile", {
    id: candidate.id,
    encoding: candidate.encoding,
    table: candidate.codeTable,
  }),
  ascii: t(language, "character_profile_trial_ascii"),
  spanish: t(language, "character_profile_trial_spanish"),
  symbols: t(language, "character_profile_trial_symbols"),
});
export type CharacterProfileTrialTexts = ReturnType<
  typeof characterProfileTrialTexts
>;
