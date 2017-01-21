const express = require('express');
const app = express();
const functions = require('./catcher');
const bodyParser = require('body-parser');
const {catcher} = functions;

app.set('view engine', 'pug');

app.use(express.static('public'));

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.render('index', { title: 'Hey', message: 'Hello there!' });
});

app.post('/', function (req, res) {
    catcher(req.body.url, 'public/upload/test')
        .then(fileDest => {
           res.send(JSON.stringify({link: fileDest}));
        });
});


app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});