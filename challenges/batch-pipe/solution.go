package main

import (
	"errors"
	"io"
)

const MaxItems = 5

type Producer interface {
	// Next returns the next batch of at most MaxItems items, or io.EOF when drained.
	Next() (items []int, cookie int, err error)
	Commit(cookie int) error
}

type Consumer interface {
	Process(items []int) error
}

func Pipe(p Producer, c Consumer) error {
	var buf []int
	var cookies []int
	flush := func() error {
		if len(buf) == 0 {
			return nil
		}
		if err := c.Process(buf); err != nil {
			return err
		}
		for _, ck := range cookies {
			if err := p.Commit(ck); err != nil {
				return err
			}
		}
		buf, cookies = nil, nil
		return nil
	}
	for {
		items, cookie, err := p.Next()
		if errors.Is(err, io.EOF) {
			return flush()
		}
		if err != nil {
			return err
		}
		if len(buf)+len(items) > MaxItems {
			if err := flush(); err != nil {
				return err
			}
		}
		buf = append(buf, items...)
		cookies = append(cookies, cookie)
	}
}
