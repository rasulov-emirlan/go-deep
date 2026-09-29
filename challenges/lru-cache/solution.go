package main

import (
	"container/list"
	"sync"
)

type entry struct{ k, v string }

type LRU struct {
	mu    sync.Mutex
	cap   int
	ll    *list.List
	items map[string]*list.Element
}

func NewLRU(capacity int) *LRU {
	return &LRU{cap: capacity, ll: list.New(), items: make(map[string]*list.Element)}
}

func (c *LRU) Get(k string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[k]
	if !ok {
		return "", false
	}
	c.ll.MoveToFront(e)
	return e.Value.(*entry).v, true
}

func (c *LRU) Set(k, v string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[k]; ok {
		e.Value.(*entry).v = v
		c.ll.MoveToFront(e)
		return
	}
	c.items[k] = c.ll.PushFront(&entry{k, v})
	if c.ll.Len() > c.cap {
		old := c.ll.Back()
		c.ll.Remove(old)
		delete(c.items, old.Value.(*entry).k)
	}
}
