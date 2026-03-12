'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [toast, setToast] = useState(null);
    const [rentalDays, setRentalDaysState] = useState(1);

    useEffect(() => {
        const saved = localStorage.getItem('pico-cart');
        if (saved) {
            try { setCart(JSON.parse(saved)); } catch { }
        }
        const savedDays = localStorage.getItem('pico-rental-days');
        if (savedDays) {
            const d = parseInt(savedDays);
            if (d > 0) setRentalDaysState(d);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('pico-cart', JSON.stringify(cart));
    }, [cart]);

    const setRentalDays = useCallback((days) => {
        const d = Math.max(1, parseInt(days) || 1);
        setRentalDaysState(d);
        localStorage.setItem('pico-rental-days', String(d));
    }, []);

    const addToCart = useCallback((product, quantity = 1, comment = '') => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + quantity, comment: comment || item.comment }
                        : item
                );
            }
            return [...prev, { ...product, quantity, comment }];
        });
        setToast(`Added to cart`);
        setTimeout(() => setToast(null), 3000);
    }, []);

    const removeFromCart = useCallback((productId) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    }, []);

    const updateQuantity = useCallback((productId, quantity) => {
        if (quantity <= 0) {
            setCart(prev => prev.filter(item => item.id !== productId));
            return;
        }
        setCart(prev =>
            prev.map(item =>
                item.id === productId ? { ...item, quantity } : item
            )
        );
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
    }, []);

    const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const grandTotal = cartTotal * rentalDays;

    return (
        <CartContext.Provider value={{
            cart, addToCart, removeFromCart, updateQuantity, clearCart,
            cartTotal, cartCount, toast,
            rentalDays, setRentalDays, grandTotal,
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within CartProvider');
    return context;
}
