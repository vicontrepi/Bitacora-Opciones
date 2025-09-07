# Bitácora de Opciones — Pro v7.6.4 (GitHub Pages)

Este paquete está listo para publicarse como **GitHub Pages** (estático y con HTTPS).

## Pasos rápidos (desde cero)
1. Crea un repo en GitHub (por ejemplo `bitacora-opciones`).
2. Descarga este ZIP y **sube todo su contenido** a la raíz del repo (o arrastra en GitHub → Add file → Upload files).
3. En el repo: **Settings → Pages**.
   - *Source:* **Deploy from a branch**
   - *Branch:* **main** (o la rama que uses), carpeta **/** (root)
   - Guarda los cambios.
4. Espera a que GitHub publique y abre la URL de Pages (ej: `https://usuario.github.io/bitacora-opciones/`).

> Incluye `.nojekyll` y `404.html` (redirige a `index.html` para enlaces profundos).

## PWA y almacenamiento
- Bajo **HTTPS**, podrás **Instalar app** (PWA) y usarla offline.
- Los datos se guardan **localmente** en el navegador (localStorage) por **origen** (dominio/ruta).

## Actualizaciones
- Para actualizar, sustituye/commitea los archivos. Mantén el mismo origen/URL si quieres conservar datos locales.
- Si no ves cambios: **Ctrl/Cmd+F5** o limpia caché del sitio (ojo: puede borrar almacenamiento).

## Desarrollo local
- Scripts incluidos para servir localmente:

### Windows
- `start_local_server.bat` – levanta `http://localhost:8000` y abre el navegador.

### macOS / Linux
- `start_local_server.sh` – igual; dale permisos `chmod +x start_local_server.sh`.

---

## Dominio propio (CNAME)
- Edita el archivo `CNAME` en la raíz y reemplaza el valor por tu dominio (ej.: `opciones.tudominio.com`).
- En tu DNS, crea un **CNAME** apuntando a `<tu-usuario>.github.io`.
- Tras propagarse, GitHub servirá tu app en ese dominio (HTTPS incluido).

## Despliegue con **GitHub Actions** (automático en `main`)
1. En el repo: **Settings → Pages** → **Source: GitHub Actions**.
2. Acepta los permisos por defecto (Pages / OIDC).
3. El workflow `deploy-pages.yml` ya está listo; cada `push` a `main` publicará la app.
4. Si usas otra rama, cambia `branches: [ "main" ]` en `.github/workflows/deploy-pages.yml`.

> Alternativa sin Actions: usa "Deploy from a branch" y sirve `/` desde `main`.

