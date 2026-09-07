# Sistema de inscripción — Curso Taller de Investigación Aplicada

Arquitectura cliente-servidor:

- `frontend/`: React + Vite.
- `backend/`: Node.js + Express + MySQL.

## Puesta en marcha

1. Copia `backend/.env.example` como `backend/.env` y configura las credenciales.
2. Ejecuta `pnpm db:setup` dentro de `backend/` para crear o actualizar MySQL.
3. Ejecuta `pnpm dev` dentro de `backend/`.
4. Ejecuta `pnpm dev` dentro de `frontend/`.

Frontend: `http://localhost:5173`. API: `http://localhost:5000`.

## Producción

Consulta [DEPLOYMENT.md](DEPLOYMENT.md) para publicar el repositorio en GitHub y desplegarlo en un VPS mediante Dokploy y Docker Compose.
