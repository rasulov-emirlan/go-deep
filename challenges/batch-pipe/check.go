package main

import (
	"errors"
	"fmt"
	"io"
)

// fake is both Producer and Consumer. It serves batches with cookies 1, 2, …
// and logs Process/Commit calls. Processed slices are kept by reference and
// printed at the end, so a reused buffer shows up as changed data.
type fake struct {
	batches  [][]int
	next     int
	nextErr  error // returned instead of io.EOF when the batches run out
	failProc int   // Process call number that fails (1-based), 0 = never
	procs    int
	events   []any // []int for Process, int for Commit
}

var errBoom = errors.New("boom")

func (f *fake) Next() ([]int, int, error) {
	if f.next == len(f.batches) {
		if f.nextErr != nil {
			return nil, 0, f.nextErr
		}
		return nil, 0, io.EOF
	}
	f.next++
	return append([]int(nil), f.batches[f.next-1]...), f.next, nil
}

func (f *fake) Commit(cookie int) error {
	f.events = append(f.events, cookie)
	return nil
}

func (f *fake) Process(items []int) error {
	f.procs++
	f.events = append(f.events, items)
	if f.procs == f.failProc {
		return errBoom
	}
	return nil
}

// log renders the events: "P[1 2]" for Process, "C3" for Commit.
func (f *fake) log() []string {
	out := []string{}
	for _, e := range f.events {
		switch e := e.(type) {
		case []int:
			out = append(out, fmt.Sprint("P", e))
		case int:
			out = append(out, fmt.Sprint("C", e))
		}
	}
	return out
}

func main() {
	check("fills buffers, commits after each Process", func() (any, any) {
		f := &fake{batches: [][]int{{1, 2}, {3, 4}, {5, 6}, {7, 8, 9}, {10}}}
		err := Pipe(f, f)
		return []any{f.log(), err}, []any{[]string{"P[1 2 3 4]", "C1", "C2", "P[5 6 7 8 9]", "C3", "C4", "P[10]", "C5"}, nil}
	})
	check("a full batch goes alone", func() (any, any) {
		f := &fake{batches: [][]int{{1, 2, 3, 4, 5}, {6}}}
		err := Pipe(f, f)
		return []any{f.log(), err}, []any{[]string{"P[1 2 3 4 5]", "C1", "P[6]", "C2"}, nil}
	})
	check("empty source", func() (any, any) {
		f := &fake{}
		err := Pipe(f, f)
		return []any{f.log(), err}, []any{[]string{}, nil}
	})
	check("Process error: returned, nothing more committed", func() (any, any) {
		f := &fake{batches: [][]int{{1, 2, 3}, {4, 5, 6}, {7, 8, 9}}, failProc: 2}
		err := Pipe(f, f)
		return []any{f.log(), err}, []any{[]string{"P[1 2 3]", "C1", "P[4 5 6]"}, errBoom}
	})
	check("Next error: returned, nothing committed", func() (any, any) {
		f := &fake{batches: [][]int{{1}, {2}}, nextErr: errBoom}
		err := Pipe(f, f)
		commits := 0
		for _, e := range f.events {
			if _, ok := e.(int); ok {
				commits++
			}
		}
		return []any{commits, err}, []any{0, errBoom}
	})
	done()
}
