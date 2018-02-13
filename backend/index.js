/*eslint brace-style: ["error", "1tbs", { "allowSingleLine": true }]*/
/*eslint brace-style: ["error", "stroustrup"]*/

class InputError extends Error {}
class DBconnectionError extends Error {}
class DBcommunicationError extends Error {}

import express from 'express';
import http from 'http';
import bodyParser from 'body-parser';
import mysql from 'mysql';
import regeneratorRuntime from 'regenerator-runtime';
import cfg from './cfg';

const app = express();
const server = http.createServer(app);

const io = require('socket.io')(server);

const pool = mysql.createPool(cfg);

app.use(express.static('../../frontend/assets'));
app.use(bodyParser.urlencoded({
    extended: true,
}));

app.get('*', (req, res) => {
    //res.sendFile('C:/Users/Tom/Desktop/pss_rocnikovka/frontend/index.html');
    res.sendFile('C:\\Users\\tom\\Desktop\\pss_rocnikovka\\frontend\\experimental\\index.html');
});
io.on('connection', async (socket) => {
    socket.emit('test', 'KOKOT');
    socket.on('testtest', (data) => console.log(data));
    socket.on('requestChartdata', async (data) => {
        console.log("requested")
        const d = JSON.parse(data);

        const x = d.from.split('-');
        const y = d.to.split('-');

        try {
            checkInput(...x);
            checkInput(...y);

            const connection = await new Promise((res, rej) => {
                pool.getConnection((err, connection) => {
                    if (err) {
                        rej(new DBconnectionError());
                    }
                    res(connection);
                });
            });
            const rowCount = await new Promise((res, rej) => {
                connection.query(`SELECT COUNT(ID) as Count FROM log
                WHERE Datum >= '${mysql.excape(x[0])}-${mysql.excape(x[1])}-${mysql.excape(x[2])} ${mysql.excape(x[3])}:${mysql.excape(x[4])}:00'
                AND Datum < '${mysql.excape(y[0])}-${mysql.excape(y[1])}-${mysql.excape(y[2])} ${mysql.excape(y[3])}:${mysql.excape(y[4])}:00'`, (err, results) => {
                    if (err) {
                        rej(new DBcommunicationError());
                    }
                    res(results);
                });
            });

            let i = 0;

            if (rowCount[0].Count < 50) {
                console.log('stfulintr');
            }
            else if (rowCount[0].Count) {
                let j = rowCount[0].Count;

                for (; j > 50; i += 1) {
                    j /= 2;
                }
            }
            else {
                let j = rowCount[0].Count - 1;

                for (; j > 50; i += 1) {
                    j /= 2;
                }
            }
            const query = `SELECT * FROM
            (SELECT @row := @row +1 AS rownum, log.* FROM
                (SELECT @row := 0) r, log) ranked
                WHERE rownum % ${2 ** i} = 0
                AND Datum >= '${mysql.excape(x[0])}-${mysql.excape(x[1])}-${mysql.excape(x[2])} ${mysql.excape(x[3])}:${mysql.excape(x[4])}:00'
                AND Datum < '${mysql.excape(y[0])}-${mysql.excape(y[1])}-${(y[2])} ${mysql.excape(y[3])}:${mysql.excape(y[4])}:00'`;
            const rows = await new Promise((res, rej) => {
                connection.query(query, (err, results) => {
                    if (err) {
                        console.log(err);
                        rej(new DBcommunicationError());
                    }
                    res(results);
                });
            });

            connection.release();
            const returnData = [];

            for (let i = 0; i < rows.length; i += 1) {
                const splitted = rows[i].Datum.toString().split(' ');

                returnData.push({
                    date: `${splitted[1]}/${splitted[2]}/${splitted[3]}, ${splitted[4]}`,
                    hodnota: rows[i].Hodnota,
                });
            }
            socket.emit('sendChartdata', JSON.stringify(returnData));
        }
        catch (err) {
            if (err instanceof InputError) {
                socket.emit('input_error', err.message);
            }
            else if (err instanceof DBconnectionError) {
                socket.emit('DB_error', 'Chyba při snaze se spojit s databází.');
            }
            else if (err instanceof DBcommunicationError) {
                socket.emit('DB_error', 'Chyba při komunikaci s databází.');
            }
            else {
                socket.emmit('DB_error', 'Neznámá chyba');
            }
        }
    });

    try {
        console.log("before conn")
        const connection = await new Promise((res, rej) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    rej(new DBconnectionError());
                }
                res(connection);
            });
        });
        const rows = await new Promise((res, rej) => {
            connection.query('SELECT * FROM log ORDER BY ID DESC,ID desc LIMIT 12', (err, results) => {
                if (err) {
                    rej(new DBcommunicationError());
                }
                res(results);
            });
        });

        connection.release();
        console.log("releasin")
        socket.emit('update', JSON.stringify(
            rows.map((item) => {
                const splitted = item.Datum.toString().split(' ');

                return { time: `${splitted[1]} ${splitted[2]} ${splitted[3]}, ${splitted[4]}`, value: item.Hodnota };
            })
        ));
    }
    catch (err) {
        if (err instanceof DBconnectionError) {
            socket.emit('DB_error', 'Nebylo možné načíst poslední záznamy z důvodu selhání se připojit k databázi');
        }
        else if (err instanceof DBcommunicationError) {
            socket.emit('DB_error', 'Nebylo možné načíst poslední záznamy z důvodu chyby při komunikaci s databází');
        }
        else {
            socket.emit('DB_error', 'Nebylo možné načíst poslední záznamy kvůli neznámé chybě');
        }
    }
});

const updateClients = async () => {
    try {
        const connection = await new Promise((res, rej) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    rej(new DBconnectionError());
                }
                res(connection);
            });
        });
        const row = await new Promise((res, rej) => {
            connection.query('SELECT * FROM log ORDER BY ID DESC,ID desc LIMIT 1', (err, results) => {
                if (err) {
                    rej(new DBcommunicationError());
                }
                res(results);
            });
        });
        const splitted = row[0].Datum.toString().split(' ');

        connection.release();
        io.sockets.emit('update', JSON.stringify({ time: `${splitted[1]} ${splitted[2]} ${splitted[3]}, ${splitted[4]}`, value: row[0].Hodnota }));
    }
    catch (err) {
        if (err instanceof DBconnectionError) {
            console.log('conn');
        }
        else if (err instanceof DBcommunicationError) {
            console.log('comm');
        }
        else {
            console.log('idk');
        }
    }
};

const checkInput = (y, m, d, h, mn) => {
    if ([y, m, d, h, mn].includes(undefined) || [y, m, d, h, mn].includes('')) {
        throw new InputError('Některá z políček nejsou vyplněná!');
    }
    for (const i of [y, m, d, h, mn]) {
        if (isNaN(i)) {
            throw new InputError('Jeden z inputů není číslo!');
        }
    }
    if (m < 1 || m > 12) {
        throw new InputError(`Tento měsíc neexistuje! (${m})`);
    }
    const maxdays = { _1: '31', _2: '28', _3: '31', _4: '30', _5: '31', _6: '30', _7: '31', _8: '31', _9: '30', _10: '31', _11: '30', _12: '31' };

    if (d < '1' || d > maxdays[`_${m}`]) {
        throw new InputError(`Tento den neexistuje! ${d}`);
    }
    else if (h < '0' || h > '23') {
        throw new InputError(`Tato hodina neexistuje! ${h}`);
    }
    else if (mn < '0' || mn > '59') {
        throw new InputError(`Tato minuta neexistuje! ${mn}`);
    }
    else if (new Date(y, m - 1, d, h, mn) > new Date()) {
        throw new InputError('Záznamy z budoucnosti nemohou existovat!');
    }
};

server.listen(80);
