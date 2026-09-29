package main

func main() {
	check("example", func() (any, any) { return Repeated([]string{"a", "bb", "bb", "b", "a", "a"}), []string{"a", "bb"} })
	check("order of first appearance", func() (any, any) { return Repeated([]string{"b", "a", "a", "b"}), []string{"b", "a"} })
	check("three copies listed once", func() (any, any) { return Repeated([]string{"x", "x", "x"}), []string{"x"} })
	check("no repeats gives empty", func() (any, any) { return Repeated([]string{"a", "b"}), []string{} })
	check("empty string counts", func() (any, any) { return Repeated([]string{"", "a", ""}), []string{""} })
	done()
}
