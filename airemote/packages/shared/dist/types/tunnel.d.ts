export type TunnelStatus = 'active' | 'connecting' | 'failed' | 'idle';
export interface TunnelInfo {
    layer: import('./device').TunnelLayer;
    address: string;
    port: number;
    status: TunnelStatus;
    latencyMs?: number;
    connectedAt?: Date;
}
export interface TunnelConfig {
    relayUrl: string;
    relayToken: string;
    cloudflareTunnel?: boolean;
    ngrokToken?: string;
    boreServer?: string;
    preferLan?: boolean;
}
//# sourceMappingURL=tunnel.d.ts.map