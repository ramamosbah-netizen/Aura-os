import { Injectable } from '@nestjs/common';

export interface CommandMetadata {
  key: string;
  description: string;
  payloadProperties: string[]; // e.g. ['value: number', 'supplier?: string']
}

@Injectable()
export class SdkGeneratorService {
  generateTypeScriptSDK(commands: CommandMetadata[]): string {
    const classMethods: string[] = [];

    for (const cmd of commands) {
      // Normalize command key to method name (e.g. 'finance.invoice.approve' -> 'financeInvoiceApprove')
      const methodName = cmd.key
        .split('.')
        .map((part, index) =>
          index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join('');

      const propertiesJoined = cmd.payloadProperties.join('; ');

      classMethods.push(`
  /**
   * ${cmd.description}
   * Command Key: ${cmd.key}
   */
  async ${methodName}(payload: { ${propertiesJoined} }, idempotencyKey?: string): Promise<any> {
    return this.postCommand('${cmd.key}', payload, idempotencyKey);
  }
      `);
    }

    return `// ==========================================
// AURA OS Client SDK — Auto-Generated Helper
// ==========================================

export class AuraClientSDK {
  constructor(
    private readonly baseUrl: string,
    private readonly bearerToken: string
  ) {}

  private async postCommand(commandKey: string, payload: any, idempotencyKey?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${this.bearerToken}\`,
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const response = await fetch(\`\${this.baseUrl}/api/v1/commands/submit\`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: commandKey, payload }),
    });
    if (!response.ok) {
      throw new Error(\`Command failed: \${response.statusText}\`);
    }
    return response.json();
  }
  ${classMethods.join('\n')}
}
`;
  }
}
