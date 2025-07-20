import mongoose from "mongoose";
import { VMRecord, IVMRecord } from "../models/vmRecord";
import { ProvisionOptions, ProvisionResult } from "../types/api";

export class DatabaseService {
  private static isConnected = false;

  /**
   * Initialize database connection
   */
  public static async connect(): Promise<void> {
    try {
      const mongoUri =
        process.env.MONGODB_URI || "mongodb://localhost:27017/proxmox-daemon";

      if (this.isConnected) {
        console.log("📊 Database already connected");
        return;
      }

      await mongoose.connect(mongoUri);
      this.isConnected = true;
      console.log("📊 Connected to MongoDB successfully");

      mongoose.connection.on("error", (error) => {
        console.error("❌ MongoDB connection error:", error);
        this.isConnected = false;
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("⚠️  MongoDB disconnected");
        this.isConnected = false;
      });
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  public static async disconnect(): Promise<void> {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log("📊 Disconnected from MongoDB");
    }
  }

  /**
   * Save VM record to database
   */
  public static async saveVMRecord(
    provisionOptions: ProvisionOptions & {
      subscriptionId: string;
      custEmail: string;
    },
    provisionResult: ProvisionResult,
    templateName: string,
    storage: string
  ): Promise<IVMRecord> {
    try {
      const vmRecord = new VMRecord({
        vmid: provisionResult.vmid,
        subscriptionId: provisionOptions.subscriptionId,
        custEmail: provisionOptions.custEmail,
        name: provisionResult.config.name,
        hostname: provisionResult.config.hostname,
        os: provisionResult.config.os,
        cores: provisionResult.config.cores,
        memory: provisionResult.config.memory,
        diskSize: provisionOptions.diskSize || "10G",
        status: provisionResult.status,
        network: {
          bridge: provisionResult.config.network?.bridge || "vmbr0",
          vlan: provisionResult.config.network?.vlan || 1,
          speed: provisionResult.config.network?.speed || "100",
        },
        config: {
          username: provisionResult.config.username,
          template: templateName,
          storage: storage,
        },
      });

      const savedRecord = await vmRecord.save();
      console.log(`💾 Saved VM record to database: ${savedRecord.vmid}`);
      return savedRecord;
    } catch (error) {
      console.error("❌ Failed to save VM record:", error);
      throw error;
    }
  }

  /**
   * Update VM status in database
   */
  public static async updateVMStatus(
    vmid: number,
    status: string
  ): Promise<IVMRecord | null> {
    try {
      const updatedRecord = await VMRecord.findOneAndUpdate(
        { vmid },
        { status, dateUpdated: new Date() },
        { new: true }
      );

      if (updatedRecord) {
        console.log(`💾 Updated VM ${vmid} status to: ${status}`);
      }

      return updatedRecord;
    } catch (error) {
      console.error(`❌ Failed to update VM ${vmid} status:`, error);
      throw error;
    }
  }

  /**
   * Get VM records by subscription ID
   */
  public static async getVMsBySubscription(
    subscriptionId: string
  ): Promise<IVMRecord[]> {
    try {
      return await VMRecord.find({ subscriptionId }).sort({
        dateProvisioned: -1,
      });
    } catch (error) {
      console.error(
        `❌ Failed to get VMs for subscription ${subscriptionId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get VM records by customer email
   */
  public static async getVMsByCustomer(
    custEmail: string
  ): Promise<IVMRecord[]> {
    try {
      return await VMRecord.find({ custEmail }).sort({ dateProvisioned: -1 });
    } catch (error) {
      console.error(`❌ Failed to get VMs for customer ${custEmail}:`, error);
      throw error;
    }
  }

  /**
   * Get VM record by VMID
   */
  public static async getVMByVMID(vmid: number): Promise<IVMRecord | null> {
    try {
      return await VMRecord.findOne({ vmid });
    } catch (error) {
      console.error(`❌ Failed to get VM ${vmid}:`, error);
      throw error;
    }
  }

  /**
   * Get all VM records with pagination
   */
  public static async getAllVMs(
    page: number = 1,
    limit: number = 50,
    filter?: { subscriptionId?: string; custEmail?: string; status?: string }
  ): Promise<{
    vms: IVMRecord[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const query = filter ? { ...filter } : {};
      const skip = (page - 1) * limit;

      const [vms, total] = await Promise.all([
        VMRecord.find(query)
          .sort({ dateProvisioned: -1 })
          .skip(skip)
          .limit(limit),
        VMRecord.countDocuments(query),
      ]);

      return {
        vms,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error("❌ Failed to get VMs:", error);
      throw error;
    }
  }

  /**
   * Delete VM record
   */
  public static async deleteVMRecord(vmid: number): Promise<boolean> {
    try {
      const result = await VMRecord.deleteOne({ vmid });
      return result.deletedCount > 0;
    } catch (error) {
      console.error(`❌ Failed to delete VM record ${vmid}:`, error);
      throw error;
    }
  }
}
