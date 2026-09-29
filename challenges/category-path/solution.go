package main

type Category struct {
	Name     string
	Children []*Category
}

func FindPath(root *Category, name string) []string {
	var path []string
	var dfs func(c *Category) bool
	dfs = func(c *Category) bool {
		path = append(path, c.Name)
		if c.Name == name {
			return true
		}
		for _, ch := range c.Children {
			if dfs(ch) {
				return true
			}
		}
		path = path[:len(path)-1]
		return false
	}
	if root == nil || !dfs(root) {
		return nil
	}
	return path
}
