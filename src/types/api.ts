import { z } from "zod";

export const ProvisionOptionsSchema = z.object({
  subscriptionId: z.string().min(1, "Subscription ID is required"),
  custEmail: z.string().email("Valid email address is required"),
  os: z.string().min(1, "OS is required"),
  name: z
    .string()
    .min(1, "VM name is required")
    .max(64, "VM name cannot exceed 64 characters")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "VM name can only contain letters, numbers, hyphens, and underscores"
    ),
  cores: z
    .number()
    .int()
    .min(1, "Cores must be at least 1")
    .max(32, "Cores cannot exceed 32")
    .optional(),
  memory: z
    .number()
    .int()
    .min(512, "Memory must be at least 512 MB")
    .max(32768, "Memory cannot exceed 32 GB")
    .optional(),
  hostname: z
    .string()
    .min(1, "Hostname is required")
    .max(253, "Hostname cannot exceed 253 characters")
    .regex(/^[a-zA-Z0-9.-]+$/, "Invalid hostname format"),
  username: z.string().min(1).max(32).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  sshKey: z.string().optional(),
  diskSize: z
    .string()
    .regex(
      /^\d+[GM]B?$/i,
      'Disk size must be in format like "20G", "20GB", "1024M", or "1024MB"'
    )
    .optional(),
  network: z
    .object({
      vlan: z
        .number()
        .int()
        .min(1, "VLAN must be at least 1")
        .max(4094, "VLAN cannot exceed 4094")
        .optional(),
      speed: z
        .string()
        .regex(/^\d+(\.\d+)?$/, "Speed must be a number (MB/s, decimals allowed)")
        .optional(),
    })
    .optional(),
});

export const VMIdParamSchema = z.object({
  vmid: z.string().regex(/^\d+$/, "VM ID must be a number").transform(Number),
});

export const VMIdQuerySchema = z.object({
  vmid: z.coerce.number().int().min(100, "VM ID must be at least 100"),
});

export const VMActionSchema = z.object({
  action: z.enum(
    ["start", "stop", "restart", "reset"],
    "Action must be one of: start, stop, restart, reset"
  ),
});

export const HealthCheckQuerySchema = z.object({
  detailed: z.coerce.boolean().optional(),
});

export type ProvisionOptions = z.infer<typeof ProvisionOptionsSchema>;

export interface ProvisionResult {
  vmid: number;
  status: "created" | "starting" | "running" | "error";
  message?: string;
  config: {
    os: string;
    name: string;
    cores: number;
    memory: number;
    hostname: string;
    username: string;
    network?: {
      bridge: string;
      vlan: number;
      speed: string;
    };
  };
}

export interface HealthCheckResult {
  status: "ok" | "error";
  timestamp: string;
  uptime: number;
  version: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationErrorResponse extends ApiResponse {
  success: false;
  error: string;
  validationErrors?: ValidationError[];
}
