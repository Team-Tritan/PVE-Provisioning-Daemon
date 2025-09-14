import { FastifyInstance } from "fastify";
import { ProxmoxService } from "./services/proxmoxCLIService";
import { ProxmoxAPIService } from "./services/proxmoxAPIService";
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

  /**
   * @api {post} /provision-vm Provision a new VM
   * @apiBody {Object} VM configuration options
   * @apiSuccess {Object} data Provisioned VM details
   * @apiError {String} error Error message if provisioning fails
   */
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

      const result = await ProxmoxService.provisionVM(validation.data);

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

  /**
   * @api {get} /healthcheck Health check for API and Proxmox connection
   * @apiSuccess {Object} data Health status and metrics
   */
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

  /**
   * @api {get} /templates Get all VM templates
   * @apiSuccess {Object[]} templates List of VM templates
   */
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

  /**
   * @api {get} /vms List all VMs
   * @apiSuccess {Object[]} vms List of VMs
   */
  fastify.get("/vms", async (request, reply) => {
    try {
      const vms = await ProxmoxService.listVMs();

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

  /**
   * @api {get} /vm/:vmid/status Get status of a VM
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiSuccess {String} status VM status
   * @apiError {String} error Error message if VM not found
   */
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
      const status = await ProxmoxService.getVMStatus(vmid);

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

  /**
   * @api {get} /vms/subscription/:subscriptionId List VMs by subscription
   * @apiParam {String} subscriptionId Subscription ID
   * @apiSuccess {Object[]} vms List of VMs
   */
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

  /**
   * @api {get} /vms/customer/:custEmail List VMs by customer email
   * @apiParam {String} custEmail Customer email
   * @apiSuccess {Object[]} vms List of VMs
   */
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

  /**
   * @api {get} /vm/:vmid/record Get VM record from database
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiSuccess {Object} data VM record
   * @apiError {String} error Error message if VM not found
   */
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

  /**
   * @api {get} /vms/all List all VMs with pagination and filters
   * @apiQuery {Number} page Page number
   * @apiQuery {Number} limit Items per page
   * @apiQuery {String} subscriptionId Subscription ID
   * @apiQuery {String} custEmail Customer email
   * @apiQuery {String} status VM status
   * @apiSuccess {Object[]} vms List of VMs
   */
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

  /**
   * @api {get} /vm/:vmid/config Get VM configuration
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiSuccess {Object} config VM configuration
   * @apiError {String} error Error message if VM not found
   */
  fastify.get("/vm/:vmid/config", async (request, reply) => {
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
      const config = await ProxmoxService.getVMConfig(vmid);

      if (!config) {
        const response: ApiResponse = {
          success: false,
          error: `VM config not found for VMID: ${vmid}`,
          timestamp: formatTimestamp(),
        };

        return reply.code(404).send(response);
      }

      const response: ApiResponse = {
        success: true,
        data: config,
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

  /**
   * @api {post} /vm/:vmid/power Power control for VM
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiBody {String} action Power action ("start", "stop", "restart", "reset")
   * @apiSuccess {Object} result Power action result
   * @apiError {String} error Error message if action fails
   */
  fastify.post("/vm/:vmid/power", async (request, reply) => {
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
      const { action } = request.body as { action: string };

      const allowedActions = ["start", "stop", "restart", "reset"];
      if (!allowedActions.includes(action)) {
        const response: ValidationErrorResponse = {
          success: false,
          error: `Invalid action. Allowed: ${allowedActions.join(", ")}`,
          validationErrors: [{ field: "action", message: "Invalid action" }],
          timestamp: formatTimestamp(),
        };
        return reply.code(400).send(response);
      }

      let result;
      switch (action) {
        case "start":
          result = await ProxmoxService.startVM(vmid);
          break;
        case "stop":
          result = await ProxmoxService.stopVM(vmid);
          break;
        case "restart":
          result = await ProxmoxService.restartVM(vmid);
          break;
        case "reset":
          result = await ProxmoxService.resetVM(vmid);
          break;
        default:
          throw new Error("Unknown action");
      }

      const response: ApiResponse = {
        success: true,
        data: { vmid, action, result },
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

  /**
   * @api {get} /vm/:vmid/stats Get VM resource usage stats
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiSuccess {Object} stats VM stats
   * @apiError {String} error Error message if VM not found
   */
  fastify.get("/vm/:vmid/stats", async (request, reply) => {
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
      // stats should include resource usage: ram_used, cpu_used, disk_used, etc.
      const stats = await ProxmoxService.getVMStats(vmid);

      if (!stats) {
        const response: ApiResponse = {
          success: false,
          error: `VM stats not found for VMID: ${vmid}`,
          timestamp: formatTimestamp(),
        };
        return reply.code(404).send(response);
      }

      const response: ApiResponse = {
        success: true,
        // Example: { ram_used: ..., cpu_used: ..., disk_used: ... }
        data: stats,
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

  /**
   * @api {get} /isos List available ISO files
   * @apiSuccess {String[]} isos List of ISO filenames
   */
  fastify.get("/isos", async (request, reply) => {
    try {
      const isos = await ProxmoxService.listISOs();
      const response: ApiResponse = {
        success: true,
        data: { isos },
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

  /**
   * @api {post} /vm/:vmid/mount-iso Mount an ISO to a VM
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiBody {String} iso ISO filename
   * @apiSuccess {String} message Success message
   * @apiError {String} error Error message if mount fails
   */
  fastify.post("/vm/:vmid/mount-iso", async (request, reply) => {
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
      const { iso } = request.body as { iso: string };

      if (!iso) {
        const response: ValidationErrorResponse = {
          success: false,
          error: "ISO filename is required",
          validationErrors: [{ field: "iso", message: "Required" }],
          timestamp: formatTimestamp(),
        };
        return reply.code(400).send(response);
      }

      await ProxmoxService.mountISO(vmid, iso);

      const response: ApiResponse = {
        success: true,
        data: { vmid, iso, message: "ISO mounted successfully" },
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

  /**
   * @api {post} /vm/:vmid/boot-order Set VM boot order
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiBody {String} order Boot order string (e.g. "cdrom,scsi0")
   * @apiSuccess {String} message Success message
   * @apiError {String} error Error message if update fails
   */
  fastify.post("/vm/:vmid/boot-order", async (request, reply) => {
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
      const { order } = request.body as { order: string };

      if (!order || typeof order !== "string") {
        const response: ValidationErrorResponse = {
          success: false,
          error: "Boot order is required (e.g. 'cdrom,scsi0')",
          validationErrors: [{ field: "order", message: "Required" }],
          timestamp: formatTimestamp(),
        };
        return reply.code(400).send(response);
      }

      await ProxmoxService.setBootOrder(vmid, order);

      const response: ApiResponse = {
        success: true,
        data: { vmid, order, message: "Boot order updated successfully" },
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

  /**
   * @api {post} /vm/:vmid/notes Set VM notes/description
   * @apiParam {Number} vmid Virtual Machine ID
   * @apiBody {String} notes Notes string
   * @apiSuccess {String} message Success message
   * @apiError {String} error Error message if update fails
   */
  fastify.post("/vm/:vmid/notes", async (request, reply) => {
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
      const { notes } = request.body as { notes: string };

      if (!notes || typeof notes !== "string") {
        const response: ValidationErrorResponse = {
          success: false,
          error: "Notes are required",
          validationErrors: [{ field: "notes", message: "Required" }],
          timestamp: formatTimestamp(),
        };
        return reply.code(400).send(response);
      }

      await ProxmoxService.setVMNotes(vmid, notes);

      const response: ApiResponse = {
        success: true,
        data: { vmid, notes, message: "Notes updated successfully" },
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