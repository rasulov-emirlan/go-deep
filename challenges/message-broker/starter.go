package main

import "context"

type Broker struct {
	// your fields here
}

func NewBroker() *Broker {
	return &Broker{}
}

func (b *Broker) Send(topic string, msg []byte) {
	// your code here
}

func (b *Broker) Receive(ctx context.Context, topic string) ([]byte, error) {
	// your code here
	return nil, nil
}
