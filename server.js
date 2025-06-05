// server.js
const express = require('express');
const path = require('path');
const fs = require('fs'); // Módulo para interactuar con el sistema de archivos

const app = express();
// Usa el puerto que Render.com te asigne, o 3000 si lo ejecutas localmente
const PORT = process.env.PORT || 3000; 

// --- Configuración de CORS (Permite que tu app de Glide y el visor se comuniquen con el servidor) ---
app.use((req, res, next) => {
    // IMPORTANTE: En producción, considera restringir '*' a dominios específicos para mayor seguridad.
    // Ejemplo: res.setHeader('Access-Control-Allow-Origin', 'https://tu-dominio-de-glide.glideapp.io');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Maneja las solicitudes OPTIONS (preflight requests) que los navegadores hacen antes de un POST/GET complejo
    if (req.method === 'OPTIONS') { 
        return res.sendStatus(200);
    }
    next(); // Pasa al siguiente middleware o ruta
});

// --- Ruta para servir el visor HTML (la interfaz del lector) ---
// Cuando alguien acceda a https://tu-servidor.onrender.com/viewer
app.get('/viewer', (req, res) => {
    const { bookId, userToken } = req.query; // Obtiene los parámetros bookId y userToken del URL

    // Si faltan parámetros, envía un error o redirige.
    if (!bookId || !userToken) {
        // En un entorno real, podrías redirigir a una página de error amigable.
        return res.status(400).send('Error: Faltan el ID del libro o el token de usuario en el URL.');
    }
    
    // Sirve el archivo HTML del visor.
    // Este archivo contiene el código JavaScript de ePub.js que luego pedirá las partes del libro.
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// --- Middleware para servir las partes del ePub (capítulos, imágenes, CSS, etc.) ---
// Esta es la ruta que ePub.js (desde el viewer.html) intentará acceder para cargar el libro.
// Ejemplo de solicitud: https://tu-servidor.onrender.com/epubs_content/mi-libro-123/OEBPS/chapter1.xhtml?userToken=ABC_XYZ_123
app.use('/epubs_content/:bookId/*', (req, res) => {
    const { bookId } = req.params; // Obtiene el ID del libro de la URL (ej. 'mi-libro-123')
    // El token puede venir en la query del URL o en las cabeceras (headers) de la solicitud.
    const userToken = req.query.userToken || req.headers.authorization; 

    // --- Lógica de Validación del userToken ---
    // Recordatorio: el userToken lo genera tu Apps Script y tiene la forma:
    // BOOKID_USERID_EXPIRATIONTIMESTAMP_RANDOMSTRING
    
    // Si no hay token, deniega el acceso inmediatamente
    if (!userToken) {
        return res.status(403).send('Acceso denegado: Token de usuario no proporcionado.');
    }

    const tokenParts = userToken.split('_'); // Divide el token por el guion bajo
    
    // Valida que el token tenga el formato esperado y que el BookID coincida
    if (tokenParts.length < 4 || tokenParts[0] !== bookId) {
        return res.status(403).send('Acceso denegado: Token inválido o no corresponde al libro.');
    }

    const tokenBookId = tokenParts[0]; // El BookID dentro del token
    const expirationTimestamp = parseInt(tokenParts[2], 10); // La fecha de expiración del token
    const currentTime = Date.now(); // El tiempo actual en milisegundos

    // Valida que el token no haya expirado
    if (isNaN(expirationTimestamp) || currentTime > expirationTimestamp) {
        return res.status(403).send('Acceso denegado: Token expirado o inválido.');
    }
    
    // Doble verificación: Asegúrate de que el token es para el libro correcto
    if (tokenBookId !== bookId) {
        return res.status(403).send('Acceso denegado: Token no válido para este libro.');
    }
    // --- Fin de Lógica de Validación ---

    // Construye la ruta completa al archivo solicitado dentro de la carpeta del ePub
    // req.path es la parte de la URL después de /epubs_content/:bookId/ (ej. /OEBPS/chapter1.xhtml)
    const relativePath = req.path; 
    const fullFilePath = path.join(__dirname, 'epubs_descomprimidos', bookId, relativePath);

    // --- Seguridad: Prevenir Path Traversal ---
    // Esto es CRÍTICO para evitar que un atacante acceda a archivos fuera de las carpetas de tus libros.
    const safeBase = path.join(__dirname, 'epubs_descomprimidos', bookId);
    if (!fullFilePath.startsWith(safeBase)) {
        console.warn(`Intento de path traversal detectado para: ${fullFilePath}`);
        return res.status(400).send('Ruta de archivo no válida.');
    }

    // --- Servir el archivo solicitado ---
    fs.readFile(fullFilePath, (err, data) => {
        if (err) {
            console.error(`Error al leer el archivo ${fullFilePath}:`, err);
            // Envía 404 si el archivo no se encuentra (es normal si ePub.js pide un archivo que no existe)
            return res.status(404).send('Archivo del libro no encontrado.');
        }

        // Determinar el Content-Type (tipo MIME) del archivo para que el navegador sepa cómo interpretarlo
        const ext = path.extname(fullFilePath).toLowerCase(); // Obtiene la extensión (ej. '.html')
        let contentType = 'application/octet-stream'; // Tipo por defecto

        switch (ext) {
            case '.html':
            case '.xhtml':
                contentType = 'application/xhtml+xml';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.svg':
                contentType = 'image/svg+xml';
                break;
            case '.opf': // Archivo de paquete de ePub
                contentType = 'application/oebps-package+xml';
                break;
            case '.ncx': // Índice de navegación de ePub
                contentType = 'application/x-dtbncx+xml';
                break;
            // Añade más tipos MIME para fuentes (.otf, .ttf, .woff, .woff2) si tus ePubs los usan
            case '.otf':
            case '.ttf':
            case '.woff':
            case '.woff2':
                contentType = 'font/opentype'; // O el tipo de fuente específico
                break;
        }
        res.setHeader('Content-Type', contentType); // Establece el tipo de contenido en la respuesta
        res.send(data); // Envía los datos del archivo al cliente
    });
});

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor ePub escuchando en el puerto ${PORT}`);
    console.log(`Puedes probar el visor aquí (