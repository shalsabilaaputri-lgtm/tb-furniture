import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(20)
  code!: string;

  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  address?: string;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  address?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
