package main

import "errors"

var ErrClosed = errors.New("logger closed")

type Logger interface {
	Log(msg string) error
	Close() error
}

type AsyncLogger struct {
	// your fields
}

func NewAsyncLogger(next Logger, buf int) *AsyncLogger {
	// your code here
	return &AsyncLogger{}
}

func (l *AsyncLogger) Log(msg string) error {
	// your code here
	return nil
}

func (l *AsyncLogger) Close() error {
	// your code here
	return nil
}
