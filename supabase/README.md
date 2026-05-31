# Supabase — aplicar el schema

## 1. Aplicar la migración

1. Abre tu proyecto en https://supabase.com/dashboard → **SQL Editor** → **New query**.
2. Copia el contenido de `migrations/0001_initial_schema.sql` y pégalo.
3. Pulsa **Run**. Debe ejecutarse sin errores.

Esto crea:
- 5 tablas (`tiendas`, `usuarios`, `tarifas`, `presupuestos`, `lineas_presupuesto`)
- Función `set_updated_at()` + trigger
- Helpers `user_tienda_id()` y `user_rol()` (security definer)
- RLS activado en las 5 tablas con políticas por `tienda_id`
- 3 buckets de Storage (`planos`, `pdfs` privados; `logos` público)
- Políticas de Storage que namespacean por `tienda_id/` como primera carpeta

## 2. (Opcional) Cargar datos de prueba

Ejecuta `seed.sql` en el mismo SQL Editor. Crea:
- Una tienda demo con `id = 00000000-0000-0000-0000-000000000001`
- Unas 16 líneas de tarifa de ejemplo (módulos bajos, altos, columnas, encimeras, electrodomésticos)

## 3. Crear usuario admin de prueba

El registro público está deshabilitado por diseño (las cuentas las crea el admin de la tienda). Para crear el primero a mano:

1. Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email + contraseña. Marca **Auto Confirm User** para saltar la verificación por email.
3. Copia el `User UID` que te genera.
4. Vuelve al **SQL Editor** y ejecuta:

```sql
insert into public.usuarios (id, tienda_id, nombre, email, rol)
values (
  '<PEGA_AQUI_EL_USER_UID>',
  '00000000-0000-0000-0000-000000000001',
  'Admin Demo',
  '<el-email-que-pusiste>',
  'admin'
);
```

Con esto tendrás un usuario autenticable que pertenece a la tienda demo y puede entrar al panel de admin.

## 4. Verificar que RLS funciona

En el SQL Editor, prueba:

```sql
-- Como usuario anon (sin auth): debería devolver 0 filas
select count(*) from public.tarifas;
```

Si devuelve 0, RLS está activo. Cuando hagamos login en el Paso 3, las consultas desde la app sí devolverán datos porque el cliente Supabase enviará el JWT del usuario.

## 5. Subir un logo (opcional, lo haremos desde la UI más adelante)

Bucket `logos`, ruta `00000000-0000-0000-0000-000000000001/logo.png`. Cualquier archivo que pongas ahí será público vía:
```
https://<PROJECT_REF>.supabase.co/storage/v1/object/public/logos/00000000-0000-0000-0000-000000000001/logo.png
```
