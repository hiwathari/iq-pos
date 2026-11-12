package com.iqpos.till;

import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Native printing for the Till web app: window.AndroidPrintBridge.print(ip, port, escposHex).
 * Writes the bytes straight to the printer's raw TCP port (9100) on a background thread —
 * fire-and-forget, no local HTTP server. lib/local-print-bridge.ts checks for this object first.
 */
public class PrintBridge {
    private static final String TAG = "IQPOSPrintBridge";
    private static final int CONNECT_TIMEOUT_MS = 5000;

    @JavascriptInterface
    public void print(final String printerIp, final int printerPort, final String escposHex) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] data = hexToBytes(escposHex);
                    Socket socket = new Socket();
                    try {
                        socket.connect(new InetSocketAddress(printerIp.trim(), printerPort), CONNECT_TIMEOUT_MS);
                        OutputStream out = socket.getOutputStream();
                        out.write(data);
                        out.flush();
                    } finally {
                        socket.close();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Print to " + printerIp + ":" + printerPort + " failed", e);
                }
            }
        }).start();
    }

    static byte[] hexToBytes(String hex) {
        String clean = hex == null ? "" : hex.trim();
        int len = clean.length() / 2;
        byte[] out = new byte[len];
        for (int i = 0; i < len; i++) {
            int hi = Character.digit(clean.charAt(i * 2), 16);
            int lo = Character.digit(clean.charAt(i * 2 + 1), 16);
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }
}
