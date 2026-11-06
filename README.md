# Real Life RPG

App Android que convierte metas y hábitos en un RPG con estética retro. Los requisitos están en [product_requirements_document.md](product_requirements_document.md).

## Requisitos

- Node 22 o superior
- JDK 21
- Android Studio con el SDK de Android

## Desarrollo web

```bash
npm install
npm run dev
```

## Pruebas

```bash
npm test
```

## Android

Compila la app web, la copia al proyecto Android y lo abre en Android Studio:

```bash
npm run android:sync
npm run android:open
```

Para instalarla directamente en un teléfono conectado por USB:

```bash
npm run android:run
```

Las llaves de firma (`*.jks`, `*.keystore`) nunca se suben al repositorio.
