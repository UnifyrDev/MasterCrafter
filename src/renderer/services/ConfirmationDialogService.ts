import { reactive } from "vue";

export type ConfirmationDialogTone = "danger" | "neutral";

export interface ConfirmationDialogRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmationDialogTone;
}

export interface ConfirmationDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmationDialogTone;
}

type ResolvedConfirmationDialogRequest = Omit<ConfirmationDialogState, "open">;

interface ConfirmationDialogQueueItem {
  request: ResolvedConfirmationDialogRequest;
  resolve: (value: boolean) => void;
}

const DEFAULT_CONFIRMATION_STATE: ConfirmationDialogState = {
  open: false,
  title: "",
  message: "",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  tone: "danger",
};

export class ConfirmationDialogService {
  private static instance: ConfirmationDialogService | null = null;
  private readonly state = reactive<ConfirmationDialogState>({ ...DEFAULT_CONFIRMATION_STATE });
  private readonly queue: ConfirmationDialogQueueItem[] = [];
  private activeRequest: ConfirmationDialogQueueItem | null = null;

  private constructor() {}

  static getInstance(): ConfirmationDialogService {
    if (!ConfirmationDialogService.instance) {
      ConfirmationDialogService.instance = new ConfirmationDialogService();
    }

    return ConfirmationDialogService.instance;
  }

  get dialogState(): ConfirmationDialogState {
    return this.state;
  }

  requestConfirmation(request: ConfirmationDialogRequest): Promise<boolean> {
    const normalizedRequest: ResolvedConfirmationDialogRequest = {
      title: request.title.trim() || "Confirm action",
      message: request.message.trim() || "Are you sure you want to continue?",
      confirmLabel: request.confirmLabel?.trim() || "Delete",
      cancelLabel: request.cancelLabel?.trim() || "Cancel",
      tone: request.tone ?? "danger",
    };

    return new Promise<boolean>((resolve) => {
      this.queue.push({
        request: normalizedRequest,
        resolve,
      });

      this.processQueue();
    });
  }

  confirm(): void {
    this.resolveActiveRequest(true);
  }

  cancel(): void {
    this.resolveActiveRequest(false);
  }

  private processQueue(): void {
    if (this.activeRequest || !this.queue.length) {
      return;
    }

    const nextRequest = this.queue.shift();
    if (!nextRequest) {
      return;
    }

    this.activeRequest = nextRequest;
    Object.assign(this.state, {
      open: true,
      title: nextRequest.request.title,
      message: nextRequest.request.message,
      confirmLabel: nextRequest.request.confirmLabel,
      cancelLabel: nextRequest.request.cancelLabel,
      tone: nextRequest.request.tone,
    });
  }

  private resolveActiveRequest(accepted: boolean): void {
    const activeRequest = this.activeRequest;
    if (!activeRequest) {
      return;
    }

    this.activeRequest = null;
    Object.assign(this.state, DEFAULT_CONFIRMATION_STATE);
    activeRequest.resolve(accepted);
    queueMicrotask(() => this.processQueue());
  }
}

export const confirmationDialogService = ConfirmationDialogService.getInstance();
