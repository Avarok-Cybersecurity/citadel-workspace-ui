import { websocketService } from './websocket-service';

// Simple EventEmitter implementation for browser
class EventEmitter {
  private events: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  uploadedBy: string;
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface UploadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

export interface FileUploadRequest {
  file: File;
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
  metadata?: Record<string, any>;
}

export interface FileUploadResponse {
  success: boolean;
  fileId?: string;
  url?: string;
  error?: string;
}

export interface FileListRequest {
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
  limit?: number;
  offset?: number;
}

export interface FileDeleteRequest {
  fileId: string;
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
}

class FileUploadServiceImpl extends EventEmitter {
  private static instance: FileUploadServiceImpl | null = null;
  private uploadQueue: Map<string, FileUploadRequest> = new Map();
  private activeUploads: Map<string, UploadProgress> = new Map();
  private fileCache: Map<string, FileMetadata[]> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): FileUploadServiceImpl {
    if (!FileUploadServiceImpl.instance) {
      FileUploadServiceImpl.instance = new FileUploadServiceImpl();
    }
    return FileUploadServiceImpl.instance;
  }

  /**
   * Upload a file to the workspace
   */
  async uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
    const fileId = this.generateFileId();
    
    // Add to upload queue
    this.uploadQueue.set(fileId, request);
    
    // Initialize upload progress
    const progress: UploadProgress = {
      fileId,
      progress: 0,
      status: 'pending'
    };
    this.activeUploads.set(fileId, progress);
    this.emit('upload-progress', progress);

    try {
      // Validate file
      if (!request.file) {
        throw new Error('No file provided');
      }

      // Check file size (max 50MB for now)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (request.file.size > maxSize) {
        throw new Error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
      }

      // Update status to uploading
      progress.status = 'uploading';
      progress.progress = 10;
      this.emit('upload-progress', progress);

      // Convert file to base64 for transmission
      const base64Data = await this.fileToBase64(request.file);
      
      progress.progress = 30;
      this.emit('upload-progress', progress);

      // Send file upload request via WebSocket
      // TODO: Use websocketService when backend is ready
      const uploadRequest = {
        UploadFile: {
          request_id: fileId,
          file_name: request.file.name,
          file_size: request.file.size,
          file_type: request.file.type,
          file_data: base64Data,
          entity_type: request.entityType,
          entity_id: request.entityId,
          metadata: request.metadata || {}
        }
      };

      // For now, simulate upload completion
      // TODO: Implement actual WebSocket file upload when backend is ready
      await this.simulateUpload(fileId, request);

      progress.progress = 100;
      progress.status = 'completed';
      this.emit('upload-progress', progress);

      // Clean up
      this.uploadQueue.delete(fileId);
      this.activeUploads.delete(fileId);

      return {
        success: true,
        fileId,
        url: `/files/${fileId}` // Placeholder URL
      };

    } catch (error) {
      // Update progress with error
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Upload failed';
      this.emit('upload-progress', progress);

      // Clean up
      this.uploadQueue.delete(fileId);
      this.activeUploads.delete(fileId);

      return {
        success: false,
        error: progress.error
      };
    }
  }

  /**
   * List files for an entity
   */
  async listFiles(request: FileListRequest): Promise<FileMetadata[]> {
    const cacheKey = `${request.entityType}:${request.entityId}`;
    
    // Check cache first
    if (this.fileCache.has(cacheKey)) {
      return this.fileCache.get(cacheKey)!;
    }

    try {
      // TODO: Implement actual WebSocket file listing when backend is ready
      // For now, return mock data
      const mockFiles = this.getMockFiles(request.entityType, request.entityId);
      
      // Cache the results
      this.fileCache.set(cacheKey, mockFiles);
      
      return mockFiles;
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(request: FileDeleteRequest): Promise<boolean> {
    try {
      // TODO: Implement actual WebSocket file deletion when backend is ready
      // For now, just remove from cache
      const cacheKey = `${request.entityType}:${request.entityId}`;
      if (this.fileCache.has(cacheKey)) {
        const files = this.fileCache.get(cacheKey)!;
        const filtered = files.filter(f => f.id !== request.fileId);
        this.fileCache.set(cacheKey, filtered);
      }
      
      this.emit('file-deleted', request.fileId);
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Get active uploads
   */
  getActiveUploads(): UploadProgress[] {
    return Array.from(this.activeUploads.values());
  }

  /**
   * Cancel an upload
   */
  cancelUpload(fileId: string): boolean {
    if (this.activeUploads.has(fileId)) {
      const progress = this.activeUploads.get(fileId)!;
      progress.status = 'failed';
      progress.error = 'Upload cancelled';
      this.emit('upload-progress', progress);
      
      this.uploadQueue.delete(fileId);
      this.activeUploads.delete(fileId);
      return true;
    }
    return false;
  }

  /**
   * Clear cache for an entity
   */
  clearCache(entityType: string, entityId: string): void {
    const cacheKey = `${entityType}:${entityId}`;
    this.fileCache.delete(cacheKey);
  }

  /**
   * Convert file to base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  }

  /**
   * Generate unique file ID
   */
  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Simulate file upload (temporary until backend is ready)
   */
  private async simulateUpload(fileId: string, request: FileUploadRequest): Promise<void> {
    const progress = this.activeUploads.get(fileId)!;
    
    // Simulate upload progress
    for (let i = 40; i <= 90; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      progress.progress = i;
      this.emit('upload-progress', progress);
    }

    // Add to mock cache
    const cacheKey = `${request.entityType}:${request.entityId}`;
    const existingFiles = this.fileCache.get(cacheKey) || [];
    
    const newFile: FileMetadata = {
      id: fileId,
      name: request.file.name,
      size: request.file.size,
      type: request.file.type,
      uploadedAt: new Date(),
      uploadedBy: 'current_user', // TODO: Get from workspace context
      entityType: request.entityType,
      entityId: request.entityId,
      url: `/files/${fileId}`
    };
    
    existingFiles.push(newFile);
    this.fileCache.set(cacheKey, existingFiles);
    
    this.emit('file-uploaded', newFile);
  }

  /**
   * Get mock files (temporary until backend is ready)
   */
  private getMockFiles(entityType: string, entityId: string): FileMetadata[] {
    // Return some sample files
    if (entityType === 'workspace') {
      return [
        {
          id: 'file_001',
          name: 'Q4 Report.pdf',
          size: 2048000,
          type: 'application/pdf',
          uploadedAt: new Date('2024-01-15'),
          uploadedBy: 'John Doe',
          entityType: 'workspace',
          entityId,
          url: '/files/file_001'
        },
        {
          id: 'file_002',
          name: 'Project Timeline.xlsx',
          size: 1024000,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          uploadedAt: new Date('2024-01-14'),
          uploadedBy: 'Jane Smith',
          entityType: 'workspace',
          entityId,
          url: '/files/file_002'
        },
        {
          id: 'file_003',
          name: 'Meeting Notes.docx',
          size: 512000,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: new Date('2024-01-13'),
          uploadedBy: 'Bob Johnson',
          entityType: 'workspace',
          entityId,
          url: '/files/file_003'
        }
      ];
    }
    return [];
  }
}

export const fileUploadService = FileUploadServiceImpl.getInstance();

// Re-export class for testing
export { FileUploadServiceImpl };