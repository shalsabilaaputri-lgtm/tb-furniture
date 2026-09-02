import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString() @MinLength(12) @MaxLength(128)
  password!: string;

  @IsString() @MinLength(2) @MaxLength(120)
  fullName!: string;

  @IsString() @Matches(/^[A-Z_]+$/)
  roleCode!: string;

  @IsOptional() @IsUUID()
  branchId?: string | null;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  fullName?: string;

  @IsOptional() @IsString() @MinLength(12) @MaxLength(128)
  password?: string;

  @IsOptional() @IsString() @Matches(/^[A-Z_]+$/)
  roleCode?: string;

  @IsOptional() @IsUUID()
  branchId?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
