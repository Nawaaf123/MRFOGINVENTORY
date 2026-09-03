import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  name: string
  role: string
}

export function UsersView() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' })

  const fetch = async () => {
    setLoading(true)
    try {
      const data = await apiGet<User[]>('/api/users')
      setUsers(data)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const handleCreate = async () => {
    try {
      await apiPost('/api/users', form)
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

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Users</h1>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Add User
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="p-4 flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{u.name?.charAt(0)?.toUpperCase() ?? u.email.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(u.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No users found</div>
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
