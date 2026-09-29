package main

import (
	"context"
	"sync"
)

type topic struct {
	msgs  [][]byte
	ready chan struct{} // closed and replaced on every Send
}

type Broker struct {
	mu     sync.Mutex
	topics map[string]*topic
}

func NewBroker() *Broker {
	return &Broker{topics: make(map[string]*topic)}
}

// topic must be called with b.mu held.
func (b *Broker) topic(name string) *topic {
	t, found := b.topics[name]
	if !found {
		t = &topic{ready: make(chan struct{})}
		b.topics[name] = t
	}
	return t
}

func (b *Broker) Send(name string, msg []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.topic(name)
	t.msgs = append(t.msgs, msg)
	close(t.ready)
	t.ready = make(chan struct{})
}

func (b *Broker) Receive(ctx context.Context, name string) ([]byte, error) {
	for {
		b.mu.Lock()
		t := b.topic(name)
		if len(t.msgs) > 0 {
			msg := t.msgs[0]
			t.msgs[0] = nil
			t.msgs = t.msgs[1:]
			b.mu.Unlock()
			return msg, nil
		}
		ready := t.ready
		b.mu.Unlock()

		select {
		case <-ready:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}
