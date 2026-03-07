const express = require('express');
const router = express.Router();

let todos = [];
let nextId = 1;

router.get('/', (req, res) => {
  res.json(todos);
});

router.get('/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id));
  if (!todo) { return res.status(404).json({ error: 'Not found' }); }
  res.json(todo);
});

router.post('/', (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const todo = { id: nextId++, title: req.body.title, completed: false };
  todos.push(todo);
  res.status(201).json(todo);
});

router.put('/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id));
  if (!todo) { return res.status(404).json({ error: 'Not found' }); }
  if (req.body.title !== undefined) { todo.title = req.body.title; }
  if (req.body.completed !== undefined) { todo.completed = req.body.completed; }
  res.json(todo);
});

router.delete('/:id', (req, res) => {
  const idx = todos.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) { return res.status(404).json({ error: 'Not found' }); }
  todos.splice(idx, 1);
  res.status(204).send();
});

module.exports = router;
