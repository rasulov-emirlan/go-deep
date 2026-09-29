package main

import (
	"errors"
	"sync"
)

var ErrClosed = errors.New("logger closed")

type Logger interface {
	Log(msg string) error
	Close() error
}

type AsyncLogger struct {
	next     Logger
	msgs     chan string
	done     chan struct{}
	mu       sync.RWMutex
	closed   bool
	once     sync.Once
	closeErr error
}

func NewAsyncLogger(next Logger, buf int) *AsyncLogger {
	l := &AsyncLogger{next: next, msgs: make(chan string, buf), done: make(chan struct{})}
	go func() {
		defer close(l.done)
		for m := range l.msgs {
			_ = l.next.Log(m)
		}
	}()
	return l
}

func (l *AsyncLogger) Log(msg string) error {
	l.mu.RLock()
	defer l.mu.RUnlock()
	if l.closed {
		return ErrClosed
	}
	l.msgs <- msg
	return nil
}

func (l *AsyncLogger) Close() error {
	l.once.Do(func() {
		l.mu.Lock()
		l.closed = true
		close(l.msgs)
		l.mu.Unlock()
		<-l.done
		l.closeErr = l.next.Close()
	})
	return l.closeErr
}
