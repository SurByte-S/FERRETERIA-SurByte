# Resumen legal académico

## 1. Diagnóstico breve del proyecto

El proyecto FERRETERÍA / LLAVE MAESTRA es una aplicación web de gestión comercial para ferreterías. Técnicamente está desarrollada con Next.js, React, TypeScript, Tailwind, shadcn/ui y Supabase. El README la describe como una base multi-tenant para administrar ferreterías, con login, datos de demo y uso previsto para prueba controlada antes de producción.

El sistema funciona como una herramienta de mostrador y administración interna. Sus rutas principales incluyen inicio o venta rápida, caja, clientes, ventas, presupuestos, stock, productos, importación de productos, ajustes, historial y configuración.

## 2. Usuarios detectados

La base de datos y los helpers de tenant prevén usuarios autenticados vinculados a una ferretería mediante roles:

- `owner`: dueño o titular operativo;
- `admin`: administrador o encargado con permisos amplios;
- `seller`: vendedor o empleado de mostrador;
- `viewer`: usuario de consulta o visualización.

En términos jurídicos y funcionales, también pueden intervenir el titular del comercio, clientes registrados, operador técnico, proveedor/desarrollador y personal interno con distintos niveles de acceso.

## 3. Datos personales y comerciales identificados

El sistema puede tratar:

- email y sesión de usuarios internos;
- nombre visible y rol del usuario en la ferretería;
- datos del cliente: nombre, teléfono, email, domicilio y notas;
- historial de presupuestos y ventas;
- productos vendidos y cantidades;
- formas de pago;
- montos abonados y saldos pendientes;
- movimientos de cuenta corriente;
- registros de caja y diferencias de cierre;
- datos comerciales del negocio: nombre, CUIT, domicilio, teléfono, email y logo.

Estos datos justifican la inclusión de cláusulas de protección de datos personales, confidencialidad, seguridad de la información, roles, permisos y responsabilidad por carga de información.

## 4. Flujos funcionales relevantes

El análisis del código muestra los siguientes flujos:

- login mediante email y contraseña con Supabase Auth;
- resolución de ferretería actual por usuario autenticado y `tenant_members`;
- búsqueda de productos por SKU, código de barras, nombre, descripción o texto normalizado;
- venta rápida desde `/inicio`;
- modo venta y modo presupuesto;
- cliente opcional, pero requerido en determinados casos de cuenta corriente;
- presupuesto con productos, cantidades, precios, número interno y estado;
- conversión de presupuesto en venta mediante RPC;
- descuento de stock al vender;
- registro de movimientos de inventario;
- apertura y cierre de caja;
- asociación de ventas a caja abierta;
- cálculo de efectivo esperado, efectivo contado y diferencia;
- impresión de presupuesto y comprobante interno de venta;
- carga manual y por CSV de productos y stock;
- cuenta corriente de clientes mediante débitos, pagos y ajustes.

Estos flujos justifican cláusulas específicas sobre stock, precios, disponibilidad, presupuestos, ventas, comprobantes internos, caja y cuenta corriente.

## 5. Riesgos legales detectados

Los principales riesgos legales y operativos son:

- tratamiento de datos personales de clientes sin política visible;
- uso de comprobantes internos que podrían confundirse con documentación fiscal;
- presupuestos sujetos a variación de precios y stock;
- registro de cuenta corriente y saldos pendientes;
- carga de notas libres con posible información innecesaria;
- errores de stock por diferencia entre sistema y depósito físico;
- productos ferreteros potencialmente riesgosos;
- uso compartido de credenciales o permisos excesivos;
- falta de página legal integrada en la interfaz;
- necesidad de revisión profesional antes de uso comercial real.

Por ese motivo, los documentos redactados aclaran que el sistema es una herramienta de gestión, no reemplaza obligaciones fiscales, no garantiza stock físico y requiere control humano.

## 6. Secciones legales incluidas y fundamento

Se incluyó una identificación de la plataforma porque el sistema posee marca, desarrollador, titular comercial y datos de contacto que deben quedar claramente diferenciados.

Se incorporó un objeto del sistema para describir su finalidad real: gestión de productos, stock, ventas, presupuestos, clientes, caja y cuenta corriente.

La aceptación de términos y usuarios autorizados se justifica porque el acceso se realiza mediante login y roles internos.

Las cláusulas de condiciones de uso, responsabilidad del usuario y responsabilidad del proveedor responden a la necesidad de distribuir responsabilidades entre quien opera el sistema, quien explota el comercio y quien desarrolla o mantiene técnicamente la aplicación.

Las cláusulas de stock, precios y disponibilidad fueron adaptadas al rubro ferretería porque el sistema permite vender productos por unidad, cantidad, stock disponible o a pedido, y el propio comprobante de presupuesto advierte que está sujeto a disponibilidad y actualización de precios.

Las cláusulas sobre ventas, comprobantes y caja se incluyeron porque el sistema registra ventas, formas de pago, caja abierta, efectivo esperado, pagos parciales y comprobantes internos. Se aclara que el comprobante interno no reemplaza factura fiscal.

Las cláusulas sobre productos riesgosos se agregaron por la naturaleza del rubro: herramientas manuales, herramientas eléctricas, productos químicos, pinturas, adhesivos, materiales eléctricos, elementos cortantes, bulonería y materiales de construcción.

Las cláusulas de protección de datos, confidencialidad y seguridad se justifican por el tratamiento de datos personales y comerciales, además de la autenticación, cookies de sesión, roles y aislamiento por ferretería.

## 7. Integración sugerida en el proyecto

Actualmente no se detectaron rutas legales públicas ni footer general con enlaces legales. El sistema sí tiene un shell de dashboard y un pie de impresión para documentos internos.

Sin rediseñar la interfaz ni modificar lógica crítica, se sugiere:

- crear una ruta pública `/terminos-y-condiciones`;
- crear una ruta pública `/politica-de-privacidad`;
- agregar enlaces discretos en la pantalla de login;
- agregar enlaces secundarios en el área de ajustes o configuración;
- evaluar si corresponde incluir una referencia breve en los comprobantes impresos, sin reemplazar la leyenda fiscal existente.

Para mantener el diseño actual, la integración debería reutilizar componentes existentes como `Card`, `PageHeader`, `Button` y el layout visual ya definido. No es necesario modificar la lógica de ventas, caja, stock ni autenticación.

## 8. Marco legal orientativo

El documento fue redactado tomando como marco general la normativa argentina aplicable, especialmente:

- Código Civil y Comercial de la Nación;
- Ley 24.240 de Defensa del Consumidor;
- Ley 25.326 de Protección de Datos Personales;
- reglas generales sobre contratos, información clara, responsabilidad, garantías, comercio electrónico y tratamiento de datos.

No se incluyeron números de artículos ni jurisprudencia específica para evitar afirmaciones no verificadas. Tampoco se promete cumplimiento legal absoluto, ya que el texto requiere revisión profesional y adaptación al uso comercial real.

## 9. Conclusión

Los Términos y Condiciones y la Política de Privacidad propuestos están adaptados al funcionamiento real del sistema: login, roles, clientes, productos, stock, presupuestos, ventas, caja, cuenta corriente, comprobantes internos e importación de datos.

El enfoque jurídico elegido es prudente: delimita responsabilidades, advierte limitaciones técnicas, protege datos personales, reconoce riesgos propios del rubro ferretería y deja placeholders para datos legales que no surgen del código.

Antes de publicar estos documentos en producción, deben ser revisados por un profesional del derecho y completados con los datos reales del titular, CUIT, domicilio, correo de contacto, jurisdicción y fecha de actualización.
