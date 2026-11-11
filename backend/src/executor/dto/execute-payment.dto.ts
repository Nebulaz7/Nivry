import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class ExecutePaymentRequestDto {
  @IsString()
  @IsNotEmpty()
  token_id!: string;

  @IsString()
  @IsNotEmpty()
  recipient!: string;

  /** Exact non-negative decimal yoctoNEAR string */
  @IsString()
  @Matches(/^\d+$/, {
    message: 'amount_yocto must be a non-negative integer string',
  })
  amount_yocto!: string;

  /** Optional expected owner guard; defaults to live chain owner_id if omitted */
  @IsOptional()
  @IsString()
  expected_owner?: string;

  /** Optional expected authority epoch guard; defaults to live chain authority_epoch if omitted */
  @IsOptional()
  @IsInt()
  @Min(0)
  authority_epoch?: number;

  /** Optional command nonce guard; defaults to live chain next_command_nonce if omitted */
  @IsOptional()
  @IsInt()
  @Min(0)
  nonce?: number;

  /** Optional deadline in nanoseconds; defaults to now + 5 minutes if omitted */
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, {
    message: 'deadline_ns must be a numeric timestamp string in nanoseconds',
  })
  deadline_ns?: string;
}
