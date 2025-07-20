import { FastifyInstance } from "fastify";
import { VMProvisioningService } from "./services/vmProvisioningService";
import { DatabaseService } from "./services/databaseService";
import { configManager } from "./config/configManager";
import { ShellExecutor } from "./utils/shell";
import {
  formatTimestamp,
  validateProvisionOptions,
  createValidationErrorResponse,
  validateWithSchema,
} from "./utils/helpers";
import {
  ProvisionOptions,
  ApiResponse,
  HealthCheckResult,
  ValidationErrorResponse,
  VMIdParamSchema,
} from "./types/api";
import { authenticateToken } from "./middleware/auth";

export async function routes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url === "/healthcheck") {
      return;
    }

    await authenticateToken(request, reply);
  });

  fastify.post("/provision-vm", async (request, reply) => {
    try {
      const validation = validateProvisionOptions(request.body);
      if (!validation.isValid) {
        const response: ValidationErrorResponse = {
          success: false,
          error: createValidationErrorResponse(validation.errors),
          validationErrors: validation.errors,
          timestamp: formatTimestamp(),
        };

        return reply.code(400).send(response);
      }

      const result = await VMProvisioningService.provisionVM(validation.data);

      try {
        const template = configManager.getTemplate(validation.data.os);
        const defaults = configManager.getDefaults();

        await DatabaseService.saveVMRecord(
          validation.data,
          result,
          template.name,
          defaults.storage
        );
      } catch (dbError) {
        console.warn("⚠️  Failed to save VM record to database:", dbError);
      }

      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: formatTimestamp(),
      };

      return reply.code(201).send(response);
    } catch (err) {
      console.error("Provisioning error:", err);

      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/healthcheck", async () => {
    const startTime = process.hrtime();
    let proxmoxConnected = false;

    try {
      proxmoxConnected = await ShellExecutor.validateProxmoxConnection();
    } catch (error) {
      console.warn("Proxmox connection check failed:", error);
    }

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    const healthResult: HealthCheckResult = {
      status: proxmoxConnected ? "ok" : "error",
      timestamp: formatTimestamp(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    };

    const response: ApiResponse<HealthCheckResult> = {
      success: true,
      data: {
        ...healthResult,
        proxmox_connected: proxmoxConnected,
        response_time_ms: Math.round(responseTime * 100) / 100,
      } as any,
      timestamp: formatTimestamp(),
    };

    return response;
  });

  fastify.get("/templates", async (request, reply) => {
    try {
      const templates = configManager.getAllTemplates();

      const response: ApiResponse = {
        success: true,
        data: { templates },
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vms", async (request, reply) => {
    try {
      const vms = await VMProvisioningService.listVMs();

      const response: ApiResponse = {
        success: true,
        data: { vms },
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vm/:vmid/status", async (request, reply) => {
    try {
      const validation = validateWithSchema(VMIdParamSchema, request.params);
      if (!validation.isValid) {
        const response: ValidationErrorResponse = {
          success: false,
          error: "Invalid VM ID parameter",
          validationErrors: validation.errors,
          timestamp: formatTimestamp(),
        };

        return reply.code(400).send(response);
      }

      const { vmid } = validation.data!;
      const status = await VMProvisioningService.getVMStatus(vmid);

      const response: ApiResponse = {
        success: true,
        data: { vmid, status },
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vms/subscription/:subscriptionId", async (request, reply) => {
    try {
      const { subscriptionId } = request.params as { subscriptionId: string };
      const vms = await DatabaseService.getVMsBySubscription(subscriptionId);

      const response: ApiResponse = {
        success: true,
        data: { vms, count: vms.length },
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vms/customer/:custEmail", async (request, reply) => {
    try {
      const { custEmail } = request.params as { custEmail: string };
      const vms = await DatabaseService.getVMsByCustomer(custEmail);

      const response: ApiResponse = {
        success: true,
        data: { vms, count: vms.length },
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vm/:vmid/record", async (request, reply) => {
    try {
      const validation = validateWithSchema(VMIdParamSchema, request.params);
      if (!validation.isValid) {
        const response: ValidationErrorResponse = {
          success: false,
          error: "Invalid VM ID parameter",
          validationErrors: validation.errors,
          timestamp: formatTimestamp(),
        };

        return reply.code(400).send(response);
      }

      const { vmid } = validation.data!;
      const vmRecord = await DatabaseService.getVMByVMID(vmid);

      if (!vmRecord) {
        const response: ApiResponse = {
          success: false,
          error: `VM record not found for VMID: ${vmid}`,
          timestamp: formatTimestamp(),
        };

        return reply.code(404).send(response);
      }

      const response: ApiResponse = {
        success: true,
        data: vmRecord,
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });

  fastify.get("/vms/all", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        limit?: string;
        subscriptionId?: string;
        custEmail?: string;
        status?: string;
      };

      const page = parseInt(query.page || "1", 10);
      const limit = parseInt(query.limit || "50", 10);

      const filter: any = {};
      if (query.subscriptionId) filter.subscriptionId = query.subscriptionId;
      if (query.custEmail) filter.custEmail = query.custEmail;
      if (query.status) filter.status = query.status;

      const result = await DatabaseService.getAllVMs(page, limit, filter);

      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: formatTimestamp(),
      };

      return response;
    } catch (err) {
      const response: ApiResponse = {
        success: false,
        error: String(err),
        timestamp: formatTimestamp(),
      };

      return reply.code(500).send(response);
    }
  });
}
