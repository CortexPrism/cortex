import type { ISessionContext } from '../../core/contracts/mod.ts';

export interface IValidationRequest extends ISessionContext {
  action: string;
  toolName?: string;
  command?: string;
  path?: string;
  params?: Record<string, unknown>;
}

export interface IValidationResult {
  allowed: boolean;
  reason: string;
}

export interface IValidator {
  validateRequest(req: IValidationRequest): Promise<IValidationResult>;
}
