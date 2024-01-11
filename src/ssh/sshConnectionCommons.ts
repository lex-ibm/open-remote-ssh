import {ConnectConfig, ExecOptions} from "ssh2";

export interface SSHConnectConfig extends ConnectConfig {
    /** Optional Unique ID attached to ssh connection. */
    uniqueId?: string;
    /** Automatic retry to connect, after disconnect. Default true */
    reconnect?: boolean;
    /** Number of reconnect retry, after disconnect. Default 10 */
    reconnectTries?: number;
    /** Delay after which reconnect should be done. Default 5000ms */
    reconnectDelay?: number;
    /** Path to private key */
    identity?: string | Buffer;
}

export interface SSHTunnelConfig {
    /** Remote Address to connect */
    remoteAddr?: string;
    /** Local port to bind to. By default, it will bind to a random port, if not passed */
    localPort?: number;
    /** Remote Port to connect */
    remotePort?: number;
    /** Remote socket path to connect */
    remoteSocketPath?: string;
    socks?: boolean;
    /**  Unique name */
    name?: string;
}

export const SSHDefaultOptions: Partial<SSHConnectConfig> = {
    reconnect: false,
    port: 22,
    reconnectTries: 3,
    reconnectDelay: 5000
};

export const SSHConstants = {
    'CHANNEL': {
        SSH: 'ssh',
        TUNNEL: 'tunnel',
        X11: 'x11'
    },
    'STATUS': {
        BEFORECONNECT: 'beforeconnect',
        CONNECT: 'connect',
        BEFOREDISCONNECT: 'beforedisconnect',
        DISCONNECT: 'disconnect'
    }
};

export interface ISSHConnection {
    connect(config?: SSHConnectConfig): Promise<ISSHConnection>;
    exec(command: string, tester: (stdout: string, stderr: string) => boolean, params?: Array<string>, options?: ExecOptions): Promise<{ stdout: string; stderr: string }>;
    disconnect(): Promise<void>;
}
