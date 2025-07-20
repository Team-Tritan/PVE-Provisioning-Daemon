import { configManager } from "../config/configManager";
import {
  ProvisionOptionsSchema,
  ValidationError,
  VMIdParamSchema,
  VMActionSchema,
  HealthCheckQuerySchema,
} from "../types/api";
import { ZodError, ZodSchema } from "zod";

export class VMIdManager {
  private static readonly VM_ID_FILE = "/tmp/proxmox-daemon-vmid";
  private static nextId: number | null = null;
  private static vmCache: Set<number> | null = null;
  private static cacheExpiry: number = 0;
  private static readonly CACHE_TTL = 30000;

  public static async getNextVMId(): Promise<number> {
    if (this.nextId === null) {
      await this.initializeVMId();
    }

    await this.refreshVMCache();

    let candidateId = this.nextId!;
    const maxAttempts = 1000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      if (!this.vmCache!.has(candidateId)) {
        if (!(await this.quickIdCheck(candidateId))) {
          this.nextId = candidateId + 1;
          await this.saveVMId();
          return candidateId;
        } else {
          this.vmCache!.add(candidateId);
        }
      }

      candidateId++;
      attempts++;
    }

    throw new Error(
      `Could not find available VM ID after ${maxAttempts} attempts starting from ${this.nextId}`
    );
  }

  private static async refreshVMCache(): Promise<void> {
    const now = Date.now();

    if (this.vmCache && now < this.cacheExpiry) {
      return;
    }

    console.log("🔄 Refreshing VM cache...");
    this.vmCache = new Set<number>();

    try {
      const { runCommand } = await import("../utils/shell");

      try {
        const clusterVMs = await runCommand(
          `pvesh get /cluster/resources --type vm --output-format json`
        );
        const vms = JSON.parse(clusterVMs);

        for (const vm of vms) {
          if (vm.vmid && typeof vm.vmid === "number") {
            this.vmCache.add(vm.vmid);
          }
        }

        console.log(`✅ Cached ${this.vmCache.size} VMs from cluster`);
        this.cacheExpiry = now + this.CACHE_TTL;
        return;
      } catch (pveshError) {
        console.warn(`⚠️  Cluster check failed, falling back to local methods`);
      }

      try {
        const listOutput = await runCommand("qm list");
        const lines = listOutput.split("\n");

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const vmid = parseInt(parts[0]);
          if (!isNaN(vmid)) {
            this.vmCache.add(vmid);
          }
        }

        console.log(`✅ Cached ${this.vmCache.size} VMs from local qm list`);
        this.cacheExpiry = now + this.CACHE_TTL;
      } catch (listError) {
        console.warn(`⚠️  Local qm list failed, using file system scan`);

        try {
          const hostname = await runCommand("hostname");
          const nodeName = hostname.trim();
          const configDir = `/etc/pve/nodes/${nodeName}/qemu-server/`;

          const fs = await import("fs");
          const files = await fs.promises.readdir(configDir);

          for (const file of files) {
            if (file.endsWith(".conf")) {
              const vmid = parseInt(file.replace(".conf", ""));
              if (!isNaN(vmid)) {
                this.vmCache.add(vmid);
              }
            }
          }

          console.log(`✅ Cached ${this.vmCache.size} VMs from config files`);
          this.cacheExpiry = now + this.CACHE_TTL / 2;
        } catch (fsError) {
          console.error(`❌ All VM discovery methods failed:`, fsError);
          this.cacheExpiry = now + 5000;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to refresh VM cache:`, error);
      this.cacheExpiry = now + 5000;
    }
  }

  private static async quickIdCheck(vmid: number): Promise<boolean> {
    try {
      const { runCommand } = await import("../utils/shell");
      const hostname = await runCommand("hostname");
      const nodeName = hostname.trim();
      const configPath = `/etc/pve/nodes/${nodeName}/qemu-server/${vmid}.conf`;

      const fs = await import("fs");
      await fs.promises.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  private static async initializeVMId(): Promise<void> {
    try {
      const fs = await import("fs");
      const data = await fs.promises.readFile(this.VM_ID_FILE, "utf8");
      this.nextId = parseInt(data.trim()) || 1001;
    } catch (error) {
      this.nextId = 1001;
      await this.saveVMId();
    }
  }

  private static async saveVMId(): Promise<void> {
    try {
      const fs = await import("fs");
      await fs.promises.writeFile(this.VM_ID_FILE, this.nextId!.toString());
    } catch (error) {
      console.warn("⚠️  Could not save VM ID state:", error);
    }
  }

  public static async refreshCache(): Promise<void> {
    this.cacheExpiry = 0;
    await this.refreshVMCache();
  }

  public static getCacheStats(): { size: number; expiresIn: number } {
    return {
      size: this.vmCache?.size || 0,
      expiresIn: Math.max(0, this.cacheExpiry - Date.now()),
    };
  }
}

export function validateWithSchema<T>(
  schema: ZodSchema<T>,
  data: any
): { isValid: boolean; errors: ValidationError[]; data?: T } {
  try {
    const validatedData = schema.parse(data);
    return {
      isValid: true,
      errors: [],
      data: validatedData,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const validationErrors: ValidationError[] = error.issues.map(
        (err: any) => ({
          field: err.path.join("."),
          message: err.message,
        })
      );

      return {
        isValid: false,
        errors: validationErrors,
      };
    }

    return {
      isValid: false,
      errors: [{ field: "unknown", message: "Validation failed" }],
    };
  }
}

export function validateProvisionOptions(opts: any): {
  isValid: boolean;
  errors: ValidationError[];
  data?: any;
} {
  const schemaValidation = validateWithSchema(ProvisionOptionsSchema, opts);
  if (!schemaValidation.isValid) {
    return schemaValidation;
  }

  const validationErrs: ValidationError[] = [];

  try {
    configManager.getTemplate(schemaValidation.data!.os);
  } catch (error) {
    validationErrs.push({
      field: "os",
      message: (error as Error).message,
    });
  }

  if (validationErrs.length > 0) {
    return {
      isValid: false,
      errors: validationErrs,
    };
  }

  return schemaValidation;
}

export function formatTimestamp(): string {
  return new Date().toISOString();
}

export function sanitizeVMName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
}

export function createValidationErrorResponse(
  errors: ValidationError[]
): string {
  const errorMessages = errors.map((err) => `${err.field}: ${err.message}`);
  return `Validation failed: ${errorMessages.join(", ")}`;
}
