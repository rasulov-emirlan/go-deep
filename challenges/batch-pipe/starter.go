package main

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
	// your code here
	return nil
}
