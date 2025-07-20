import mongoose, { Schema, Document } from "mongoose";

export interface IVMRecord extends Document {
  vmid: number;
  subscriptionId: string;
  custEmail: string;
  name: string;
  hostname: string;
  os: string;
  cores: number;
  memory: number;
  diskSize: string;
  status: "created" | "starting" | "running" | "stopped" | "error";
  network: {
    bridge: string;
    vlan: number;
    speed: string;
  };
  dateProvisioned: Date;
  dateUpdated: Date;
  config: {
    username: string;
    template: string;
    storage: string;
  };
}

const VMRecordSchema: Schema = new Schema(
  {
    vmid: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    subscriptionId: {
      type: String,
      required: true,
      index: true,
    },
    custEmail: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    hostname: {
      type: String,
      required: true,
    },
    os: {
      type: String,
      required: true,
    },
    cores: {
      type: Number,
      required: true,
    },
    memory: {
      type: Number,
      required: true,
    },
    diskSize: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["created", "starting", "running", "stopped", "error"],
      default: "created",
    },
    network: {
      bridge: {
        type: String,
        required: true,
      },
      vlan: {
        type: Number,
        required: true,
      },
      speed: {
        type: String,
        required: true,
      },
    },
    dateProvisioned: {
      type: Date,
      default: Date.now,
      index: true,
    },
    dateUpdated: {
      type: Date,
      default: Date.now,
    },
    config: {
      username: {
        type: String,
        required: true,
      },
      template: {
        type: String,
        required: true,
      },
      storage: {
        type: String,
        required: true,
      },
    },
  },
  {
    timestamps: { createdAt: "dateProvisioned", updatedAt: "dateUpdated" },
  }
);

VMRecordSchema.index({ subscriptionId: 1, custEmail: 1 });
VMRecordSchema.index({ dateProvisioned: -1 });

export const VMRecord = mongoose.model<IVMRecord>("VMRecord", VMRecordSchema);
