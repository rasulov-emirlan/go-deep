package main

type myError string

func (e myError) Error() string { return string(e) }

func Handle() error {
	return myError("went wrong")
}
