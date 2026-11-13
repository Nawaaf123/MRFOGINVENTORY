import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, mobileActionClass } from '@/components/layout/PageShell'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  name?: string
  fullName?: string
  role: string
}

export function UsersView() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return (
        (u.name || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter])

  const fetch = async () => {
    setLoading(true)
    try {
      const data = await apiGet<User[]>('/api/users')
      setUsers(data.map((u) => ({ ...u, name: u.fullName || u.name || u.email })))
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const handleCreate = async () => {
    try {
      await apiPost('/api/users', {
        email: form.email,
        password: form.password,
        fullName: form.name,
        role: form.role,
      })
      toast.success('User created')
      setOpen(false)
      setForm({ email: '', name: '', password: '', role: 'user' })
      fetch()
    } catch {
      toast.error('Failed to create user')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return
    try {
      await apiDelete(`/api/users/${id}`)
      toast.success('User deleted')
      fetch()
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (loading) return <div className="py-4 pr-4 pl-16 sm:py-6 sm:pr-6 lg:pl-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Users</h1>
          <Button className={mobileActionClass} onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add User
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto min-h-0 p-4 sm:p-6 space-y-3">
        {filtered.map((u) => (
          <Card key={u.id}>
            <CardContent className="p-4 flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <Avatar>
                <AvatarFallback>{u.name?.charAt(0)?.toUpperCase() ?? u.email.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{u.name}</p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
              <Button variant="ghost" size="sm" className="h-11 w-11 sm:h-8 sm:w-8 p-0 text-destructive" onClick={() => handleDelete(u.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {users.length ? 'No users match these filters' : 'No users found'}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
            <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
