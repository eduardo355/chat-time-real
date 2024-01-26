import express from "express";
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from "@libsql/client"
//web socket
import { Server } from "socket.io";
import { createServer } from 'node:http'
dotenv.config()
const port = process.env.PORT || 3000 

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

app.get('/Chat.html', (req, res) => {
    res.sendFile(process.cwd() + '/client/Chat.html')
})

const db = createClient({
    url: 'libsql://teaching-stilt-man-eduardo355.turso.io',
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        fecha DATETIME,
        userName TEXT
    ) 
`)

await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
        id_user INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        apellido TEXT,
        user TEXT
    )
`) 
let conecctionUser = 0
io.on('connection', async (socket) => {
    console.log('Usuario Conectado');
    conecctionUser += 1; 
    let name = socket.handshake.auth.name
    io.emit('UserConnection', conecctionUser.toString(), name)

    socket.on('disconnect', () => {
        conecctionUser -= 1;
        io.emit('UserConnection', conecctionUser.toString());
        console.log('Usuario desconectado');
    });

    socket.on('Registro', async (name, apellido , user) =>{
        let result 
        try {
            result = await db.execute({
                sql: 'INSERT INTO users (name, apellido, user) VALUES (:name, :apellido, :user)',
                args: {
                    name,
                    apellido,
                    user
                }
            })
            if(result.lastInsertRowid.toString()) {
                let user
                try {
                    let id_user = parseInt(result.lastInsertRowid.toString())
                    user = await db.execute({
                        sql: 'SELECT * FROM users WHERE id_user = :id_user',
                        args: { id_user: id_user}
                    })
                    if( user.rows ) {
                        io.emit('redirect', `/Chat.html?id=${user.rows[0].id_user}&name=${user.rows[0].name}&apellido=${user.rows[0].apellido}&user=${user.rows[0].user}`)
                    }
                } catch (error) {
                    console.error(error)
                }
            }
        } catch (error) {
            console.error(error)
            return
        }
    })
    // guardar mensajes
    socket.on('chat mensaje', async (msg, fechaActual) =>{
        let result
        try {
            
            result = await db.execute({
                sql: 'INSERT INTO messages (content, fecha, userName) VALUES (:message, :fecha, :userName)',
                args: { message: msg, fecha: fechaActual, userName: socket.handshake.auth.name}
            })
        } catch (error) {  
            console.error(error) 
            return
        }
        let name = socket.handshake.auth.name.toString()
        io.emit('chat mensaje', msg, result.lastInsertRowid.toString(), fechaActual, name)
    }) 
 
    if(!socket.recovered) {
        try {
            const result = await db.execute({
                sql: 'SELECT id, content, fecha, userName FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })
            result.rows.forEach(row => {
                socket.emit('chat mensaje', row.content, row.id.toString(), row.fecha.toString(), row.userName)
            })
        } catch (error) { 
            console.error(error)
        }
    }
})

app.use(logger('dev'))
app.use(express.static('client'));


server.listen(port, () => {
    console.log(`server runnig on port ${port}`);
})