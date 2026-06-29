import { Injectable, Logger } from '@nestjs/common';

// ── MCP (Model Context Protocol) Types ───────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; required?: boolean }>;
  };
}

export interface McpResource {
  uri: string;                    // e.g. 'aura://projects/p1'
  name: string;
  description: string;
  mimeType: string;
}

export interface McpRequest {
  method: 'tools/list' | 'resources/list' | 'tools/call' | 'resources/read';
  params?: {
    name?: string;                // For tools/call
    uri?: string;                 // For resources/read
    arguments?: Record<string, any>;
  };
}

export interface McpResponse {
  result?: any;
  error?: { code: number; message: string };
}

// ── MCP Server ────────────────────────────────────────────────────────────────

@Injectable()
export class McpServerService {
  private readonly logger = new Logger('McpServerService');
  private readonly tools = new Map<string, McpTool & { handler: (args: any) => Promise<any> }>();
  private readonly resources = new Map<string, McpResource & { reader: () => Promise<any> }>();

  // ── Registration ──────────────────────────────────────────────

  registerTool(tool: McpTool, handler: (args: Record<string, any>) => Promise<any>): void {
    this.tools.set(tool.name, { ...tool, handler });
    this.logger.log(`[MCP] Tool registered: "${tool.name}"`);
  }

  registerResource(resource: McpResource, reader: () => Promise<any>): void {
    this.resources.set(resource.uri, { ...resource, reader });
    this.logger.log(`[MCP] Resource registered: ${resource.uri}`);
  }

  // ── Protocol Handler ─────────────────────────────────────────

  async handle(request: McpRequest): Promise<McpResponse> {
    switch (request.method) {
      case 'tools/list':
        return {
          result: {
            tools: Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
              name, description, inputSchema,
            })),
          },
        };

      case 'resources/list':
        return {
          result: {
            resources: Array.from(this.resources.values()).map(({ uri, name, description, mimeType }) => ({
              uri, name, description, mimeType,
            })),
          },
        };

      case 'tools/call': {
        const toolName = request.params?.name;
        const tool = toolName ? this.tools.get(toolName) : undefined;
        if (!tool) {
          return { error: { code: 404, message: `Tool "${toolName}" not found` } };
        }
        try {
          this.logger.log(`[MCP] Calling tool: "${toolName}"`);
          const result = await tool.handler(request.params?.arguments ?? {});
          return { result };
        } catch (err: any) {
          return { error: { code: 500, message: err.message } };
        }
      }

      case 'resources/read': {
        const uri = request.params?.uri;
        const resource = uri ? this.resources.get(uri) : undefined;
        if (!resource) {
          return { error: { code: 404, message: `Resource "${uri}" not found` } };
        }
        const content = await resource.reader();
        return { result: { uri, mimeType: resource.mimeType, content } };
      }

      default:
        return { error: { code: 400, message: `Unknown MCP method: ${(request as any).method}` } };
    }
  }
}
