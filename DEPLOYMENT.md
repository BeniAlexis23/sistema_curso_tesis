# Despliegue en GitHub, VPS y Dokploy

## 1. Arquitectura de producción

El archivo `compose.yaml` levanta tres servicios:

- `frontend`: compila React y lo sirve mediante Nginx en el puerto interno 80.
- `backend`: ejecuta Node.js y Express en el puerto interno 5000.
- `mysql`: ejecuta MySQL 8.4 únicamente dentro de la red privada de Docker.

Nginx sirve la aplicación y reenvía las peticiones `/api/*` al backend. Solo el frontend debe recibir un dominio público.

Los datos persistentes se almacenan en dos volúmenes Docker nombrados:

- `curso_mysql_data`: archivos internos de MySQL.
- `curso_uploads`: documentos PDF montados en `/app/backend/uploads`.

Estos volúmenes sobreviven a reinicios, reconstrucciones y nuevos despliegues. Nunca guardes los PDFs únicamente dentro de la imagen o del checkout de GitHub.

## 2. Requisitos previos

- Un repositorio vacío en GitHub.
- Un VPS con Dokploy instalado y Docker operativo.
- Un dominio o subdominio, por ejemplo `inscripciones.undc.edu.pe`.
- Acceso al DNS del dominio para crear un registro `A` hacia la IP pública del VPS.
- Contraseñas nuevas y distintas para MySQL, el administrador y JWT.

## 3. Publicar el proyecto en GitHub

Desde la raíz del proyecto ejecuta:

```bash
git init
git branch -M main
git add .
git commit -m "Preparar sistema de inscripciones para producción"
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

Antes de `git add`, verifica siempre:

```bash
git status
```

No deben aparecer `backend/.env`, `backend/uploads`, `node_modules` ni `dist`. Están excluidos en `.gitignore` y `.dockerignore`.

Si el repositorio es privado, conecta GitHub con Dokploy o configura una credencial de acceso en el proveedor Git de Dokploy.

## 4. Preparar el DNS

En el proveedor del dominio crea:

```text
Tipo: A
Nombre: inscripciones
Valor: IP_PUBLICA_DEL_VPS
TTL: Automático
```

Espera a que el dominio resuelva hacia el VPS antes de solicitar el certificado HTTPS.

## 5. Crear el proyecto en Dokploy

1. Ingresa a Dokploy.
2. Crea un proyecto, por ejemplo `Curso Taller de Tesis`.
3. Dentro del entorno `Production`, crea un servicio de tipo **Docker Compose**.
4. Selecciona GitHub como proveedor.
5. Elige el repositorio y la rama `main`.
6. Indica `compose.yaml` como ruta del archivo Compose.
7. Activa Auto Deploy si quieres desplegar automáticamente cada `git push`.

## 6. Variables de entorno en Dokploy

En la sección **Environment** del servicio Compose agrega valores reales:

```env
APP_URL=https://inscripciones.undc.edu.pe

DB_USER=curso_app
DB_PASSWORD=CLAVE_MYSQL_DE_APLICACION
MYSQL_ROOT_PASSWORD=CLAVE_MYSQL_ROOT_DISTINTA

JWT_SECRET=SECRETO_ALEATORIO_DE_64_CARACTERES_O_MAS
ADMIN_EMAIL=admin@undc.edu.pe
ADMIN_PASSWORD=CLAVE_INICIAL_DEL_ADMINISTRADOR

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tallertesis.sistemas@undc.edu.pe
SMTP_PASSWORD=CONTRASENA_DE_APLICACION_DE_GOOGLE
MAIL_FROM=Taller de Tesis - Facultad de Ingeniería <tallertesis.sistemas@undc.edu.pe>
```

Genera valores aleatorios en el VPS con:

```bash
openssl rand -base64 48
```

Ejecuta el comando tres veces y utiliza resultados diferentes para `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` y `JWT_SECRET`. No copies `.env.production.example` como configuración real sin reemplazar sus valores.

## 7. Configurar el dominio y HTTPS

En la sección **Domains** del Compose:

1. Añade `inscripciones.undc.edu.pe`.
2. Selecciona el servicio `frontend`.
3. Selecciona el puerto interno `80`.
4. Configura la ruta `/`.
5. Activa HTTPS y solicita el certificado de Let's Encrypt.
6. Habilita la redirección de HTTP a HTTPS.

No publiques directamente los servicios `backend` ni `mysql`. La API se accede a través de `https://inscripciones.undc.edu.pe/api` y Nginx la reenvía dentro de Docker.

## 8. Primer despliegue

Presiona **Deploy**. El orden esperado es:

1. MySQL inicia y pasa su health check.
2. El backend ejecuta `pnpm db:setup`, crea las tablas y el administrador inicial.
3. Express pasa su health check.
4. Nginx inicia el frontend.

Revisa los logs de los tres servicios. Después prueba:

```text
https://inscripciones.undc.edu.pe/
https://inscripciones.undc.edu.pe/api/health
https://inscripciones.undc.edu.pe/admin/login
```

`/api/health` debe responder:

```json
{"status":"ok"}
```

## 9. Persistencia de los PDF

El backend guarda los archivos en `/app/backend/uploads`. En producción esa ruta está montada en el volumen `curso_uploads`:

```yaml
volumes:
  - curso_uploads:/app/backend/uploads
```

Cuando Dokploy vuelve a clonar GitHub o reconstruye el contenedor, el volumen no se reemplaza. Los nombres físicos de los volúmenes suelen incluir el nombre interno del proyecto Compose; consúltalos en Dokploy o con:

```bash
docker volume ls
```

No cambies el volumen por una carpeta absoluta del VPS dentro del Compose. Dokploy recomienda volúmenes nombrados para datos y copias de seguridad.

## 10. Copias de seguridad

Configura dos trabajos en **Volume Backups** de Dokploy:

- Volumen asociado a `curso_mysql_data`.
- Volumen asociado a `curso_uploads`.

Frecuencia sugerida:

- Base de datos: diaria.
- PDFs: diaria.
- Retención: mínimo 14 o 30 días.
- Destino: almacenamiento S3 compatible fuera del mismo VPS.

Además del volumen MySQL, es recomendable generar un respaldo lógico periódico:

```bash
docker compose exec -T mysql mysqldump \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers curso_investigacion > curso_investigacion.sql
```

La copia lógica y la carpeta de PDFs corresponden al mismo estado funcional. Conserva ambos respaldos.

## 11. Actualizaciones posteriores

Para publicar cambios:

```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```

Si Auto Deploy está habilitado, Dokploy construirá nuevas imágenes. Los volúmenes de MySQL y PDFs permanecerán intactos.

## 12. Comprobaciones de seguridad

- Cambia las claves de ejemplo antes del primer despliegue.
- No publiques el puerto 3306 de MySQL.
- No publiques directamente el puerto 5000 del backend.
- Usa HTTPS antes de recibir DNI, teléfonos, correos y documentos.
- Restringe el acceso al panel administrativo y cambia su contraseña periódicamente.
- Usa una contraseña de aplicación, no la contraseña normal del correo institucional.
- Prueba la restauración de los respaldos, no solo su creación.
- Mantén Dokploy, Docker y el sistema operativo del VPS actualizados.
