package com.pico.nameart;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

/**
 * A single-poster web server for the booth.
 *
 * The guest's QR code is fixed: it always points at this server's root. Whatever poster was
 * generated most recently is what the guest downloads, so one printed QR serves every guest
 * without the tablet needing internet. Anyone on the same network can fetch the current
 * poster, which is the intent - it is the poster already on public display.
 */
class BoothServer implements Runnable {
    static final int PORT = 8080;

    private volatile byte[] latest;
    private volatile String latestName = "name-art.jpg";
    private ServerSocket socket;
    private Thread thread;

    void start() {
        if (thread != null) return;
        thread = new Thread(this, "booth-server");
        thread.setDaemon(true);
        thread.start();
    }

    void stop() {
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
        if (thread != null) thread.interrupt();
        thread = null;
    }

    void publish(byte[] jpeg, String fileName) {
        latest = jpeg;
        if (fileName != null && !fileName.isEmpty()) latestName = fileName;
    }

    /** The address a guest's phone should open; empty when the tablet is on no network. */
    static String address() {
        String ip = siteLocalAddress();
        return ip == null ? "" : "http://" + ip + ":" + PORT + "/";
    }

    private static String siteLocalAddress() {
        try {
            List<NetworkInterface> nics = Collections.list(NetworkInterface.getNetworkInterfaces());
            for (NetworkInterface nic : nics) {
                if (!nic.isUp() || nic.isLoopback()) continue;
                for (InetAddress address : Collections.list(nic.getInetAddresses())) {
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    @Override
    public void run() {
        try {
            socket = new ServerSocket(PORT);
            while (!Thread.currentThread().isInterrupted()) {
                try (Socket client = socket.accept()) {
                    serve(client);
                } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
    }

    private void serve(Socket client) throws Exception {
        InputStream in = client.getInputStream();
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int b, seen = 0;
        while ((b = in.read()) != -1) {
            head.write(b);
            seen = (b == '\n' || b == '\r') ? seen + 1 : 0;
            if (seen == 4 || head.size() > 8192) break;
        }
        String request = head.toString("UTF-8");
        String path = "/";
        int start = request.indexOf(' ');
        if (start > -1) {
            int end = request.indexOf(' ', start + 1);
            if (end > start) path = request.substring(start + 1, end);
        }

        OutputStream out = client.getOutputStream();
        byte[] poster = latest;

        if (poster == null) {
            byte[] body = page("<h1>Nothing yet</h1><p>Create your name art on the tablet, then scan again.</p>")
                    .getBytes(StandardCharsets.UTF_8);
            writeHead(out, "200 OK", "text/html; charset=utf-8", body.length, null);
            out.write(body);
        } else if (path.startsWith("/poster.jpg")) {
            writeHead(out, "200 OK", "image/jpeg", poster.length,
                    "attachment; filename=\"" + latestName + "\"");
            out.write(poster);
        } else if (path.startsWith("/view.jpg")) {
            writeHead(out, "200 OK", "image/jpeg", poster.length, null);
            out.write(poster);
        } else {
            byte[] body = page(
                    "<h1>Your name art</h1>"
                            + "<img src=\"/view.jpg?t=" + System.currentTimeMillis() + "\" alt=\"Your poster\">"
                            + "<a class=\"btn\" href=\"/poster.jpg\" download>Download</a>"
                            + "<p class=\"hint\">Scanned after someone else? Reload to get the newest poster.</p>")
                    .getBytes(StandardCharsets.UTF_8);
            writeHead(out, "200 OK", "text/html; charset=utf-8", body.length, null);
            out.write(body);
        }
        out.flush();
    }

    private void writeHead(OutputStream out, String status, String type, int length, String disposition)
            throws Exception {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ").append(status).append("\r\n");
        head.append("Content-Type: ").append(type).append("\r\n");
        head.append("Content-Length: ").append(length).append("\r\n");
        head.append("Cache-Control: no-store\r\n");
        head.append("Connection: close\r\n");
        if (disposition != null) head.append("Content-Disposition: ").append(disposition).append("\r\n");
        head.append("\r\n");
        out.write(head.toString().getBytes(StandardCharsets.UTF_8));
    }

    private String page(String body) {
        return "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>Your name art</title><style>"
                + "body{margin:0;padding:22px;background:#f7f1e6;color:#153e2e;"
                + "font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center}"
                + "h1{font-size:22px;font-weight:600;margin:6px 0 16px}"
                + "img{width:min(100%,430px);box-shadow:0 12px 35px #74572c25;border-radius:4px}"
                + ".btn{display:block;max-width:430px;margin:18px auto 0;padding:16px;border-radius:6px;"
                + "background:#173e2f;color:#fff8e8;text-decoration:none;font-weight:600}"
                + ".hint{color:#7d7566;font-size:12px;margin-top:16px}"
                + "</style></head><body>" + body + "</body></html>";
    }
}
