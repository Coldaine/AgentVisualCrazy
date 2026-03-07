const express = require('express');
const todosRouter = require('./routes/todos');

const app = express();
app.use(express.json());
app.use('/todos', todosRouter);

module.exports = app;
