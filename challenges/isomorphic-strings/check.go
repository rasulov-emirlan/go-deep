package main

func main() {
	check("egg add", func() (any, any) { return Isomorphic("egg", "add"), true })
	check("paper title", func() (any, any) { return Isomorphic("paper", "title"), true })
	check("foo bar", func() (any, any) { return Isomorphic("foo", "bar"), false })
	check("two chars onto one", func() (any, any) { return Isomorphic("ab", "aa"), false })
	check("counts runes, not bytes", func() (any, any) { return Isomorphic("abb", "яжж"), true })
	check("different lengths", func() (any, any) { return Isomorphic("ab", "abc"), false })
	done()
}
