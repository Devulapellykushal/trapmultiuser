"use client";

import {
    BarChart3,
    ChevronDown,
    FileText,
    LogOut,
    Package,
    Plus,
    Settings,
    ShoppingCart,
    User
} from "lucide-react";
import { useState } from "react";

import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Modal,
    ModalContent,
    ModalDescription,
    ModalFooter,
    ModalHeader,
    ModalTitle,
    ModalTrigger,
} from "@/components/ui";

export default function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen p-8 md:p-12 lg:p-16">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Header */}
        <header className="space-y-4">
          <h1 className="font-display text-heading-xl text-gradient">
            Quake Design System
          </h1>
          <p className="text-body-lg text-text-secondary max-w-2xl">
            Premium classic branding — ink surfaces, champagne brass accents, and display serif headlines.
            All components are token-driven and shared across the app.
          </p>
        </header>

        {/* Color Palette */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Color Palette</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Backgrounds */}
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-bg-primary border border-border-default" />
              <p className="text-caption">bg-primary</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-bg-surface border border-border-default" />
              <p className="text-caption">bg-surface</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-bg-elevated border border-border-default" />
              <p className="text-caption">bg-elevated</p>
            </div>
            
            {/* Accents */}
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-accent-primary" />
              <p className="text-caption">accent-primary</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-accent-secondary" />
              <p className="text-caption">accent-secondary</p>
            </div>
            
            {/* Semantic */}
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-success" />
              <p className="text-caption">success</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-warning" />
              <p className="text-caption">warning</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-md bg-danger" />
              <p className="text-caption">danger</p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Typography</h2>
          
          <Card variant="glass" padding="lg">
            <div className="space-y-6">
              <div>
                <p className="text-caption text-text-muted mb-1">Heading XL</p>
                <p className="text-heading-xl">The quick brown fox</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Heading LG</p>
                <p className="text-heading-lg">The quick brown fox</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Heading MD</p>
                <p className="text-heading-md">The quick brown fox</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Body LG</p>
                <p className="text-body-lg">The quick brown fox jumps over the lazy dog.</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Body</p>
                <p className="text-body">The quick brown fox jumps over the lazy dog.</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Body SM</p>
                <p className="text-body-sm text-text-secondary">The quick brown fox jumps over the lazy dog.</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Caption</p>
                <p className="text-caption text-text-muted">The quick brown fox jumps over the lazy dog.</p>
              </div>
              <div>
                <p className="text-caption text-text-muted mb-1">Numeric (POS Display)</p>
                <p className="numeric-lg">₹12,450.00</p>
              </div>
            </div>
          </Card>
        </section>

        {/* Buttons */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Buttons</h2>
          
          <Card variant="glass" padding="lg">
            <div className="space-y-8">
              {/* Variants */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">Variants</p>
                <div className="flex flex-wrap gap-4">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>
              
              {/* Sizes */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">Sizes</p>
                <div className="flex flex-wrap items-center gap-4">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><Plus className="h-5 w-5" /></Button>
                </div>
              </div>
              
              {/* States */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">States</p>
                <div className="flex flex-wrap gap-4">
                  <Button>Default</Button>
                  <Button loading>Loading</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </div>
              
              {/* With Icons */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">With Icons</p>
                <div className="flex flex-wrap gap-4">
                  <Button><Plus className="h-4 w-4" /> Add Item</Button>
                  <Button variant="secondary"><Package className="h-4 w-4" /> Inventory</Button>
                  <Button variant="ghost"><Settings className="h-4 w-4" /> Settings</Button>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Inputs */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Inputs</h2>
          
          <Card variant="glass" padding="lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input 
                label="Default Input" 
                placeholder="Enter text..." 
              />
              <Input 
                label="With Helper Text" 
                placeholder="Enter email..."
                helperText="We'll never share your email."
              />
              <Input 
                label="Error State" 
                placeholder="Enter password..."
                error="Password must be at least 8 characters"
              />
              <Input 
                label="Disabled" 
                placeholder="Cannot edit..."
                disabled
              />
              <Input 
                label="Number Input" 
                type="number"
                placeholder="0"
                inputSize="lg"
              />
              <Input 
                label="Small Input" 
                placeholder="Small..."
                inputSize="sm"
              />
            </div>
          </Card>
        </section>

        {/* Cards */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Cards</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card variant="default">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>Standard surface card</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-text-secondary">
                  This is a default card with standard styling.
                </p>
              </CardContent>
            </Card>
            
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated Card</CardTitle>
                <CardDescription>With shadow</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-text-secondary">
                  This card has elevation and shadow.
                </p>
              </CardContent>
            </Card>
            
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Glass Card</CardTitle>
                <CardDescription>Glassmorphism effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-text-secondary">
                  Frosted glass with backdrop blur.
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Interactive Card */}
          <Card variant="glass" hover>
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>Hover to see the effect</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-text-secondary">
                This card has hover states for clickable items.
              </p>
            </CardContent>
            <CardFooter className="justify-between">
              <Badge variant="success" dot>Active</Badge>
              <Button variant="ghost" size="sm">View Details</Button>
            </CardFooter>
          </Card>
        </section>

        {/* Badges */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Badges</h2>
          
          <Card variant="glass" padding="lg">
            <div className="space-y-6">
              {/* Variants */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">Variants</p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success">In Stock</Badge>
                  <Badge variant="warning">Low Stock</Badge>
                  <Badge variant="danger">Out of Stock</Badge>
                  <Badge variant="neutral">Draft</Badge>
                  <Badge variant="accent">Featured</Badge>
                </div>
              </div>
              
              {/* With Dot */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">With Dot Indicator</p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success" dot>Active</Badge>
                  <Badge variant="warning" dot>Pending</Badge>
                  <Badge variant="danger" dot>Failed</Badge>
                  <Badge variant="neutral" dot>Inactive</Badge>
                </div>
              </div>
              
              {/* Sizes */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">Sizes</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="accent" size="sm">Small</Badge>
                  <Badge variant="accent" size="md">Medium</Badge>
                  <Badge variant="accent" size="lg">Large</Badge>
                </div>
              </div>
              
              {/* Use Cases */}
              <div className="space-y-3">
                <p className="text-body-sm text-text-secondary font-medium">Use Cases</p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success">COMPLETED</Badge>
                  <Badge variant="warning">PENDING</Badge>
                  <Badge variant="danger">FAILED</Badge>
                  <Badge variant="neutral">CANCELLED</Badge>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Modal */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Modal</h2>
          
          <Card variant="glass" padding="lg">
            <Modal open={modalOpen} onOpenChange={setModalOpen}>
              <ModalTrigger asChild>
                <Button>Open Modal</Button>
              </ModalTrigger>
              <ModalContent size="md">
                <ModalHeader>
                  <ModalTitle>Confirm Action</ModalTitle>
                  <ModalDescription>
                    This action cannot be undone. Are you sure you want to proceed?
                  </ModalDescription>
                </ModalHeader>
                <div className="py-4">
                  <Input 
                    label="Confirmation Code" 
                    placeholder="Enter code..."
                  />
                </div>
                <ModalFooter>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => setModalOpen(false)}>
                    Confirm
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </Card>
        </section>

        {/* Dropdown */}
        <section className="space-y-6">
          <h2 className="text-heading-lg">Dropdown</h2>
          
          <Card variant="glass" padding="lg">
            <div className="flex gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    Actions <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="h-4 w-4 mr-2" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="h-4 w-4 mr-2" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger">
                    <LogOut className="h-4 w-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost">
                    Quick Actions <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>
                    <Package className="h-4 w-4 mr-2" /> New Product
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ShoppingCart className="h-4 w-4 mr-2" /> New Sale
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <FileText className="h-4 w-4 mr-2" /> New Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <BarChart3 className="h-4 w-4 mr-2" /> View Reports
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-border-default">
          <p className="text-caption text-text-muted text-center">
            Quake Design System v1.0 • Dark enterprise • Accessible & production-ready
          </p>
        </footer>
      </div>
    </div>
  );
}
