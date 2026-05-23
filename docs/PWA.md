# PWA

La app esta configurada como PWA instalable para escritorio, Android y navegadores compatibles.

## Como probar

- En local, usar `localhost` y abrir Chrome DevTools > Application > Manifest.
- Verificar que el manifest no muestre errores y que cargue los iconos de `public/icons`.
- En Application > Service Workers, verificar que `/sw.js` quede registrado en production.
- Ejecutar Lighthouse con la categoria PWA y probar la accion de instalar app.

## HTTPS

- En produccion la instalacion real requiere HTTPS.
- En local, `localhost` se considera contexto seguro.
- Si se prueba desde una IP local como `192.168.x.x`, el navegador puede bloquear la instalacion si no hay HTTPS.

## Offline

Esta etapa no implementa ventas offline, stock offline, presupuestos offline, sincronizacion, IndexedDB comercial ni push notifications.

El service worker no guarda HTML autenticado ni respuestas de datos privados. Solo cachea assets estaticos seguros como iconos, archivos de marca y recursos de `/_next/static/`.
