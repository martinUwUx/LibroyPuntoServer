// server.js (ejemplo básico con Express)
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000; // Usa el puerto 3000 por defecto o el del entorno

// Directorio donde se almacenan los archivos EPUB en el servidor
const EPUB_FOLDER = path.join(__dirname, 'epubs');

// Datos de ejemplo de los libros (en un servidor real, esto vendría de una base de datos)
const books_data = {
    "book1": { "id": "book1", "title": "El Quijote", "author": "Miguel de Cervantes", "filepath": "el_quijote.epub" },
    "book2": { "id": "book2", "title": "Cien años de soledad", "author": "Gabriel García Márquez", "filepath": "cien_anios_soledad.epub" },
    // Agrega más libros según sea necesario
};

// Middleware para servir archivos estáticos desde el directorio EPUB_FOLDER (opcional, pero útil si quieres servir portadas estáticas)
// app.use('/epubs', express.static(EPUB_FOLDER));

// Endpoint para listar todos los libros disponibles
app.get('/api/v1/books', (req, res) => {
    // Prepara los datos para la respuesta, excluyendo la ruta del archivo interno
    const books_list = Object.values(books_data).map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        // Agrega coverImageUrl si sirves las portadas como archivos estáticos
        // coverImageUrl: book.coverImageUrl ? `${req.protocol}://${req.get('host')}/epubs/${book.coverImageUrl}` : undefined
    }));
    res.json(books_list);
});

// Endpoint para obtener los datos binarios de un libro específico
app.get('/api/v1/books/:bookId/data', (req, res) => {
    const bookId = req.params.bookId;
    const book = books_data[bookId];

    if (book) {
        const filepath = path.join(EPUB_FOLDER, book.filepath);
        fs.stat(filepath, (err, stats) => {
            if (err) {
                console.error("Error al obtener información del archivo:", err);
                return res.status(404).json({ error: "Archivo no encontrado" });
            }

            // Envía el archivo con el tipo MIME correcto
            res.setHeader('Content-Type', 'application/epub+zip');
            res.setHeader('Content-Length', stats.size); // Opcional, pero recomendado
            const readStream = fs.createReadStream(filepath);
            readStream.pipe(res);

            readStream.on('error', (streamErr) => {
                console.error("Error al leer el stream del archivo:", streamErr);
                res.status(500).json({ error: "Error interno del servidor al leer el archivo" });
            });
        });
    } else {
        res.status(404).json({ error: "Libro no encontrado" });
    }
});

// Crea el directorio de EPUBs si no existe
if (!fs.existsSync(EPUB_FOLDER)) {
    fs.mkdirSync(EPUB_FOLDER);
}

// Inicia el servidor
app.listen(port, () => {
    console.log(`Servidor Express escuchando en el puerto ${port}`);
    console.log(`Coloca tus archivos EPUB en el directorio: ${EPUB_FOLDER}`);
    console.log("Endpoints disponibles:");
    console.log(`GET /api/v1/books - Listar libros`);
    console.log(`GET /api/v1/books/:bookId/data - Obtener datos de un libro`);
});
