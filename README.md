# Sistema de Gestión de Pedidos (Detalle)

Este es un sistema web autoportante e interactivo diseñado para reemplazar y mejorar la planilla Excel actual, permitiendo gestionar de forma segura y cómoda los productos, pedidos, colores, cálculos y cobros.

## 🚀 Cómo Iniciar la Aplicación

Debido a que el navegador web bloquea las importaciones de módulos JavaScript por motivos de seguridad si se abre el archivo `index.html` con doble clic directamente (error de CORS), hemos provisto un iniciador automático:

1. Hacé doble clic en el archivo **`iniciar.bat`** en esta carpeta.
2. Esto abrirá automáticamente tu navegador de internet en la dirección [http://localhost:8000](http://localhost:8000) y levantará un servidor web local super liviano (usando Python).
3. ¡Listo! Ya podés usar la aplicación.

---

## 🛠️ Arquitectura y Estructura de Archivos

El sistema está desarrollado con tecnologías web estándar modernas sin necesidad de instalar dependencias pesadas (Node.js/npm/servidores backend):

- **Motor de Base de Datos**: SQLite (mediante **sql.js** compilado a WebAssembly). Los datos se procesan con SQL real dentro del navegador.
- **Persistencia**: Se guardan automáticamente todas las transacciones en **IndexedDB** del navegador, por lo que no se pierden al cerrar o recargar la página.
- **Lógica de Precios Históricos**: La base de datos guarda una "foto" inmutable del precio unitario y nombre del producto al momento de agregar la línea en el pedido. Los cambios posteriores del catálogo de productos no afectarán los pedidos históricos.
- **Estilos**: Vanilla CSS con diseño moderno tipo dashboard oscuro, con acentos de color indigo y estados responsivos.

### Árbol de Directorios:
```
detalle/
├── iniciar.bat              # Iniciador del servidor local para Windows
├── index.html               # Esqueleto HTML de la aplicación SPA
├── css/                     # Estilos visuales divididos por componentes
│   ├── variables.css        # Paleta de colores, márgenes, fuentes
│   ├── base.css             # Estilos globales y reset
│   ├── layout.css           # Estructura del Sidebar y Viewport
│   └── components.css       # Botones, tablas, formularios, modales, alertas
├── js/                      # Lógica JavaScript en módulos ES6
│   ├── app.js               # Orquestador e inicializador principal
│   ├── router.js            # Enrutador interno para navegar sin recargas
│   ├── config.js            # Control y fórmulas de cálculos de porcentajes
│   ├── db/
│   │   ├── database.js      # Control de SQLite (sql.js) e IndexedDB
│   │   └── schema.js        # Estructura de tablas y carga de datos iniciales
│   ├── models/
│   │   ├── Product.js       # CRUD de Productos y Colores
│   │   ├── Order.js         # Transacciones y estadísticas de Pedidos
│   │   └── Payment.js       # Lógica financiera de Pagos y saldos
│   ├── views/
│   │   ├── Dashboard.js     # Panel de control de métricas rápidas
│   │   ├── Products.js      # Catálogo e inserción de productos
│   │   ├── Colors.js        # Gestión global de variantes de color
│   │   ├── Orders.js        # Historial de pedidos y filtros de búsqueda
│   │   ├── OrderForm.js     # Creación/edición interactiva de pedidos
│   │   ├── OrderDetail.js   # Detalle de pedido y registración de cobros
│   │   ├── Payments.js      # Listado general de transacciones de caja
│   │   └── Settings.js      # Ajustes de porcentajes y copias de seguridad
│   ├── components/
│   │   ├── Formatter.js     # Formateadores de moneda local ($ AR), fechas y badges
│   │   ├── Modal.js         # Modales interactivos de confirmación
│   │   └── Toast.js         # Notificaciones flotantes temporales
│   └── sync/
│       └── google-sheets.js # Estructura y stubs de integración futura con Sheets
└── README.md                # Este archivo de instrucciones
```

---

## 📈 Lógica de Cálculos (Excel Espejado)

Los cálculos se aplican dinámicamente y se pueden modificar los porcentajes desde la pestaña **Configuración**:

1. **Subtotal por Línea**: `Cantidad × Precio Histórico`
2. **Total del Pedido**: Suma de todos los subtotales del pedido.
3. **Importe Sin Factura**: `Total × 70%` (porcentaje configurable)
4. **Importe Facturado**: `Total × 30% × 1.245` (el 30% del total + un recargo del 24,5% configurable)

---

## 📦 Copias de Seguridad (Backup)

En la sección de **Configuración**, podés:
- **Exportar Base de Datos**: Descarga un archivo `.db` con toda tu información.
- **Importar Base de Datos**: Te permite cargar un archivo `.db` descargado anteriormente en cualquier computadora para migrar o restaurar tus datos.
