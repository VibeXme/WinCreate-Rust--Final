//! Local-only static hosting in Rust with restrictive browser security headers.
//! Direct Rust port of WinCreate's `server.py`.

use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::thread;

const ALLOWED_EXTENSIONS: &[&str] = &["js", "css", "html", "svg", "png", "json", "txt", "md"];

const CSP_HEADER: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

fn content_type_for(ext: &str) -> &'static str {
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "json" => "application/json; charset=utf-8",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

pub fn resolve_safe_path(root: &Path, raw_target: &str) -> Option<PathBuf> {
    let path_only = raw_target.split('?').next().unwrap_or("/");
    let trimmed = path_only.trim_start_matches('/');
    let rel = if trimmed.is_empty() {
        Path::new("index.html")
    } else {
        Path::new(trimmed)
    };

    for comp in rel.components() {
        match comp {
            Component::Normal(part) => {
                let s = part.to_string_lossy();
                if s.starts_with('.') {
                    return None;
                }
            }
            _ => return None,
        }
    }

    let ext = rel.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !ALLOWED_EXTENSIONS.contains(&ext) {
        return None;
    }

    let joined = root.join(rel);
    let canonical_root = root.canonicalize().ok()?;
    let canonical_file = joined.canonicalize().ok()?;

    if !canonical_file.starts_with(&canonical_root) || canonical_file.is_dir() {
        return None;
    }

    Some(canonical_file)
}

fn send_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) {
    let header = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         X-Content-Type-Options: nosniff\r\n\
         X-Frame-Options: DENY\r\n\
         Referrer-Policy: no-referrer\r\n\
         Content-Security-Policy: {CSP_HEADER}\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
    let _ = stream.flush();
}

fn handle_client(mut stream: TcpStream, root: &Path) {
    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };

    let req = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = req.lines();
    let Some(request_line) = lines.next() else {
        return;
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        send_response(&mut stream, "400 Bad Request", "text/plain", b"Bad Request", false);
        return;
    }

    let method = parts[0];
    let target = parts[1];
    let head_only = method == "HEAD";

    if method != "GET" && method != "HEAD" {
        send_response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain",
            b"Method Not Allowed",
            head_only,
        );
        return;
    }

    let Some(file_path) = resolve_safe_path(root, target) else {
        send_response(&mut stream, "403 Forbidden", "text/plain", b"Forbidden", head_only);
        return;
    };

    match fs::read(&file_path) {
        Ok(bytes) => {
            let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            send_response(
                &mut stream,
                "200 OK",
                content_type_for(ext),
                &bytes,
                head_only,
            );
        }
        Err(_) => {
            send_response(&mut stream, "404 Not Found", "text/plain", b"Not Found", head_only);
        }
    }
}

fn main() {
    let addr = env::var("WINCREATE_BIND").unwrap_or_else(|_| "127.0.0.1:8765".to_string());
    let root = env::current_dir()
        .map(|cwd| {
            let public_dir = cwd.join("public");
            if public_dir.exists() {
                public_dir
            } else {
                cwd
            }
        })
        .expect("Failed to resolve working directory");

    let listener = TcpListener::bind(&addr).expect("Failed to bind local WinCreate server");
    println!("WinCreate (Rust HTTP Server): http://{addr}");

    let shared_root = Arc::new(root);
    for stream in listener.incoming().flatten() {
        let root_ref = Arc::clone(&shared_root);
        thread::spawn(move || {
            handle_client(stream, &root_ref);
        });
    }
}
