import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Registro (spec autenticacion). La contraseña tiene un máximo para acotar el costo del hash. */
export class RegistroDto {
  @Transform(recortar)
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(254, { message: 'El correo es demasiado largo.' })
  correo: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede tener más de 128 caracteres.' })
  contrasena: string;
}

/** Inicio de sesión: solo se valida la forma; el resultado es siempre el error genérico. */
export class LoginDto {
  @Transform(recortar)
  @IsString({ message: 'El correo es obligatorio.' })
  @MaxLength(254, { message: 'El correo es demasiado largo.' })
  correo: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MaxLength(128, { message: 'La contraseña no puede tener más de 128 caracteres.' })
  contrasena: string;
}
