// Política de contraseñas de HomIA: la misma regla y los mismos mensajes que el registro
// (`src/app/api/auth/register/route.ts`): mínimo 8 caracteres, con letras y números, hasta 200.
// Devuelve el mensaje de error para el usuario, o null si la contraseña sirve.
export function problemaDeContrasena(pw: unknown): string | null {
  if (typeof pw !== 'string' || !pw) return 'La contraseña es obligatoria'
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'La contraseña debe combinar letras y números para proteger tu cuenta'
  if (pw.length > 200) return 'La contraseña es demasiado larga'
  return null
}
